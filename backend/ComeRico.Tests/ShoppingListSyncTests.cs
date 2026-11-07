using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Commands;
using ComeRico.Core.Features.Shopping.Commands;
using ComeRico.Core.Features.Shopping.Queries;
using ComeRico.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Tests;

public class ShoppingListSyncTests
{
    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;

        public override DateTimeOffset GetUtcNow() => Now;
    }

    // Wednesday 4 Nov 2026. With Saturday as shopping day the next trip is Sat 7 Nov.
    private static readonly DateTimeOffset Wednesday = new(2026, 11, 4, 12, 0, 0, TimeSpan.Zero);
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed class Fixture : IAsyncDisposable
    {
        public required AppDbContext Db { get; init; }
        public required Household Household { get; init; }
        public FixedClock Clock { get; } = new(Wednesday);
        public FakeCurrentUserService User { get; } = new(Guid.CreateVersion7());
        public FakeTenantService Tenant => new(Household.Id);

        public static async Task<Fixture> CreateAsync(DayOfWeek? shoppingDay = null)
        {
            var household = Household.Create("Casa", "UTC");
            household.SetShoppingDay(shoppingDay);
            var db = TestDb.Create(Guid.NewGuid().ToString(), household.Id);
            db.Households.Add(household);
            await db.SaveChangesAsync(Ct);
            return new Fixture { Db = db, Household = household };
        }

        public Task<IReadOnlyList<ShoppingItemDto>> SyncAsync() =>
            new SyncShoppingListCommandHandler(Db, Clock).Handle(new(), Ct);

        public async Task<Product> AddProductAsync(string name, int? interval = 14, DateOnly? lastPurchased = null)
        {
            var product = Product.Create(
                Household.Id,
                name,
                ProductCategory.Hygiene,
                1,
                MeasurementUnit.Package,
                interval,
                null,
                Clock.GetUtcNow().UtcDateTime
            );
            Db.Products.Add(product);
            if (lastPurchased is { } last)
            {
                // As CreateProduct does: the cache plus its event.
                product.DeclareLastPurchase(last, 1, MeasurementUnit.Package);
                Db.ProductEvents.Add(
                    ProductLastPurchaseDeclared.Create(
                        Household.Id,
                        product.Id,
                        User.UserId,
                        EventOrigin.Web,
                        Clock.GetUtcNow().UtcDateTime,
                        last
                    )
                );
            }
            await Db.SaveChangesAsync(Ct);
            return product;
        }

        public async Task PlanAsync(DateOnly date, params (string Name, decimal Amount, MeasurementUnit Unit)[] ingredients)
        {
            var dish = Dish.Create(Household.Id, $"Platillo {Guid.NewGuid():N}");
            Db.Dishes.Add(dish);
            foreach (var (name, amount, unit) in ingredients)
                Db.Ingredients.Add(Ingredient.Create(Household.Id, dish.Id, name, amount, unit));
            Db.MealPlans.Add(MealPlan.Create(Household.Id, dish.Id, date, MealType.Lunch));
            await Db.SaveChangesAsync(Ct);
        }

        public Task<ShoppingItemDto?> SetPurchasedAsync(Guid id, bool purchased) =>
            new SetShoppingItemPurchasedCommandHandler(Db, User, Clock).Handle(new(id, purchased), Ct);

        public Task<bool> DeleteAsync(Guid id) => new DeleteShoppingItemCommandHandler(Db, User, Clock).Handle(new(id), Ct);

        public async ValueTask DisposeAsync() => await Db.DisposeAsync();
    }

    // ---- Recurring products ----

    [Fact]
    public async Task Sync_AddsDueAndOutOfStockProducts_Once()
    {
        await using var f = await Fixture.CreateAsync();
        var due = await f.AddProductAsync("Shampoo", lastPurchased: new DateOnly(2026, 10, 1));
        var fresh = await f.AddProductAsync("Jabón", lastPurchased: new DateOnly(2026, 11, 3));
        var gone = await f.AddProductAsync("Arroz", interval: null);
        gone.MarkOutOfStock(Wednesday.UtcDateTime);
        var inactive = await f.AddProductAsync("Viejo");
        inactive.Deactivate();
        await f.Db.SaveChangesAsync(Ct);

        var first = await f.SyncAsync();
        var second = await f.SyncAsync();

        Assert.Equal(["Arroz", "Shampoo"], first.Select(i => i.Name));
        Assert.All(first, i => Assert.Equal(ShoppingItemSource.Recurring, i.Source));
        Assert.Equal(first.Select(i => i.Id), second.Select(i => i.Id));
        Assert.Equal(RestockStatus.OutOfStock, first.Single(i => i.ProductId == gone.Id).ProductStatus);
        Assert.Equal(1, first.Single(i => i.ProductId == due.Id).Quantity);
        Assert.DoesNotContain(first, i => i.ProductId == fresh.Id);
    }

    [Fact]
    public async Task OutOfStock_AddsToListRightAway_AndInStockRemovesIt()
    {
        await using var f = await Fixture.CreateAsync();
        var product = await f.AddProductAsync("Arroz", interval: null);

        await new MarkProductOutOfStockCommandHandler(f.Db, f.Tenant, f.User, f.Clock).Handle(new(product.Id), Ct);
        var item = Assert.Single(await f.Db.ShoppingItems.ToListAsync(Ct));
        Assert.Equal(product.Id, item.ProductId);

        await new MarkProductInStockCommandHandler(f.Db, f.Tenant, f.User, f.Clock).Handle(new(product.Id), Ct);
        Assert.Empty(await f.Db.ShoppingItems.ToListAsync(Ct));
    }

    // ---- Snooze ----

    [Fact]
    public async Task Snooze_RemovesThePendingItem_AndSyncDoesNotBringItBack()
    {
        await using var f = await Fixture.CreateAsync();
        var product = await f.AddProductAsync("Shampoo", lastPurchased: new DateOnly(2026, 10, 1));
        await f.SyncAsync();

        await new SnoozeProductCommandHandler(f.Db, f.User, f.Clock).Handle(new(product.Id, 3), Ct);

        Assert.Empty(await f.SyncAsync());
    }

    [Fact]
    public async Task ShortSnooze_WithShoppingDay_DoesNotReturnForTheSameTrip()
    {
        await using var f = await Fixture.CreateAsync(DayOfWeek.Saturday);
        var product = await f.AddProductAsync("Shampoo", lastPurchased: new DateOnly(2026, 10, 1));
        await f.SyncAsync();

        await new SnoozeProductCommandHandler(f.Db, f.User, f.Clock).Handle(new(product.Id, 1), Ct);
        Assert.Equal(new DateOnly(2026, 11, 8), product.SnoozedUntil); // the day after Saturday's trip

        f.Clock.Now = Wednesday.AddDays(2); // Friday, the eve of the trip
        Assert.Empty(await f.SyncAsync());

        f.Clock.Now = Wednesday.AddDays(4); // Sunday: back for next Saturday's trip
        Assert.Single(await f.SyncAsync());
    }

    [Fact]
    public async Task SnoozeOfAProductDueSoon_CountsFromWhenItWouldBeDue()
    {
        await using var f = await Fixture.CreateAsync();
        // Bought Tue 3 Nov every 7 days: due Tue 10 Nov.
        var product = await f.AddProductAsync("Papel", interval: 7, lastPurchased: new DateOnly(2026, 11, 3));

        await new SnoozeProductCommandHandler(f.Db, f.User, f.Clock).Handle(new(product.Id, 7), Ct);

        Assert.Equal(new DateOnly(2026, 11, 17), product.SnoozedUntil);
    }

    [Fact]
    public async Task SkipThisShopping_OfAProductDueSoon_SkipsTheTripWhereItWouldShowUp()
    {
        await using var f = await Fixture.CreateAsync(DayOfWeek.Saturday);
        // Due Tue 10 Nov: not in Saturday 7's trip but in Saturday 14's, so skipping means until Sunday 15.
        var product = await f.AddProductAsync("Papel", interval: 7, lastPurchased: new DateOnly(2026, 11, 3));

        await new SnoozeProductCommandHandler(f.Db, f.User, f.Clock).Handle(new(product.Id, 1), Ct);

        Assert.Equal(new DateOnly(2026, 11, 15), product.SnoozedUntil);
        f.Clock.Now = Wednesday.AddDays(9); // Friday 13, the eve of that trip
        Assert.Empty(await f.SyncAsync());
    }

    // ---- Removing items ----

    [Fact]
    public async Task DeletingADueItem_SkipsThisShopping_SoSyncDoesNotReAddIt()
    {
        await using var f = await Fixture.CreateAsync(DayOfWeek.Saturday);
        var product = await f.AddProductAsync("Shampoo", lastPurchased: new DateOnly(2026, 10, 1));
        var item = Assert.Single(await f.SyncAsync());

        Assert.True(await f.DeleteAsync(item.Id));

        Assert.Equal(new DateOnly(2026, 11, 8), product.SnoozedUntil);
        Assert.Single(await f.Db.ProductEvents.OfType<ProductSnoozed>().ToListAsync(Ct));
        Assert.Empty(await f.SyncAsync());
    }

    [Fact]
    public async Task DeletingAnOutOfStockItem_MeansSiHay()
    {
        await using var f = await Fixture.CreateAsync();
        var product = await f.AddProductAsync("Arroz", interval: null);
        product.MarkOutOfStock(Wednesday.UtcDateTime);
        await f.Db.SaveChangesAsync(Ct);
        var item = Assert.Single(await f.SyncAsync());

        await f.DeleteAsync(item.Id);

        Assert.Null(product.OutOfStockAt);
        Assert.Single(await f.Db.ProductEvents.OfType<ProductMarkedInStock>().ToListAsync(Ct));
        Assert.Empty(await f.SyncAsync());
    }

    [Fact]
    public async Task DeletingAManualItem_DeletesIt()
    {
        await using var f = await Fixture.CreateAsync();
        var item = await new CreateShoppingItemCommandHandler(f.Db, f.Tenant, f.Clock).Handle(
            new("Pilas", 4, MeasurementUnit.Piece),
            Ct
        );

        await f.DeleteAsync(item.Id);

        Assert.Empty(await f.Db.ShoppingItems.ToListAsync(Ct));
    }

    // ---- Menu ----

    [Fact]
    public async Task Menu_ConsolidatesTheWindow_WithoutShoppingDay_TodayPlusSix()
    {
        await using var f = await Fixture.CreateAsync();
        await f.PlanAsync(new DateOnly(2026, 11, 4), ("Cebolla", 1, MeasurementUnit.Piece), ("Arroz", 200, MeasurementUnit.Gram));
        await f.PlanAsync(new DateOnly(2026, 11, 10), (" cebolla ", 2, MeasurementUnit.Piece));
        await f.PlanAsync(new DateOnly(2026, 11, 11), ("Papa", 3, MeasurementUnit.Piece)); // outside
        await f.PlanAsync(new DateOnly(2026, 11, 3), ("Ajo", 1, MeasurementUnit.Piece)); // yesterday

        var items = await f.SyncAsync();

        Assert.Equal(["Arroz", "Cebolla"], items.Select(i => i.Name));
        Assert.Equal(3, items.Single(i => i.Name == "Cebolla").Quantity);
        Assert.All(items, i => Assert.Equal(ShoppingItemSource.MealPlan, i.Source));
    }

    [Fact]
    public async Task Menu_WithShoppingDay_CoversTheWeekStartingAtTheNextTrip()
    {
        await using var f = await Fixture.CreateAsync(DayOfWeek.Saturday);
        await f.PlanAsync(new DateOnly(2026, 11, 5), ("Ajo", 1, MeasurementUnit.Piece)); // before the trip
        await f.PlanAsync(new DateOnly(2026, 11, 7), ("Cebolla", 1, MeasurementUnit.Piece));
        await f.PlanAsync(new DateOnly(2026, 11, 13), ("Papa", 1, MeasurementUnit.Piece));
        await f.PlanAsync(new DateOnly(2026, 11, 14), ("Tomate", 1, MeasurementUnit.Piece)); // next trip's week

        var items = await f.SyncAsync();

        Assert.Equal(["Cebolla", "Papa"], items.Select(i => i.Name));
    }

    [Fact]
    public async Task Menu_EmptyWindow_DoesNotFail()
    {
        await using var f = await Fixture.CreateAsync();

        Assert.Empty(await f.SyncAsync());
    }

    [Fact]
    public async Task Menu_IsIdempotent_UpdatesInPlace_AndDropsWhatIsNoLongerPlanned()
    {
        await using var f = await Fixture.CreateAsync();
        await f.PlanAsync(new DateOnly(2026, 11, 5), ("Cebolla", 1, MeasurementUnit.Piece));
        var first = Assert.Single(await f.SyncAsync());
        Assert.Equal(first.Id, Assert.Single(await f.SyncAsync()).Id);

        await f.PlanAsync(new DateOnly(2026, 11, 6), ("Cebolla", 2, MeasurementUnit.Piece));
        var grown = Assert.Single(await f.SyncAsync());
        Assert.Equal(first.Id, grown.Id);
        Assert.Equal(3, grown.Quantity);

        f.Db.MealPlans.RemoveRange(await f.Db.MealPlans.ToListAsync(Ct));
        await f.Db.SaveChangesAsync(Ct);
        Assert.Empty(await f.SyncAsync());
    }

    [Fact]
    public async Task Menu_PurchasedItemsAreKept_AndCountAgainstWhatIsNeeded()
    {
        await using var f = await Fixture.CreateAsync();
        await f.PlanAsync(new DateOnly(2026, 11, 5), ("Cebolla", 3, MeasurementUnit.Piece));
        var item = Assert.Single(await f.SyncAsync());
        await f.SetPurchasedAsync(item.Id, true);

        var afterBuying = await f.SyncAsync();
        Assert.Equal(item.Id, Assert.Single(afterBuying).Id); // the purchased one, untouched
        Assert.True(afterBuying[0].IsPurchased);

        await f.PlanAsync(new DateOnly(2026, 11, 6), ("Cebolla", 2, MeasurementUnit.Piece));
        var more = await f.SyncAsync();
        Assert.Equal(2, more.Single(i => !i.IsPurchased).Quantity); // only the extra 2
    }

    [Fact]
    public async Task Menu_DismissedItem_IsHidden_AndNotReAdded()
    {
        await using var f = await Fixture.CreateAsync();
        await f.PlanAsync(new DateOnly(2026, 11, 5), ("Sal", 1, MeasurementUnit.Teaspoon), ("Cebolla", 1, MeasurementUnit.Piece));
        var items = await f.SyncAsync();

        await f.DeleteAsync(items.Single(i => i.Name == "Sal").Id);

        Assert.Equal(["Cebolla"], (await f.SyncAsync()).Select(i => i.Name));
        Assert.NotNull((await f.Db.ShoppingItems.SingleAsync(s => s.Name == "Sal", Ct)).DismissedAt);
    }

    // ---- Purchases ----

    [Fact]
    public async Task CheckingARecurringItem_RecordsThePurchase_AndUncheckingRevertsIt()
    {
        await using var f = await Fixture.CreateAsync();
        var declared = new DateOnly(2026, 10, 1);
        var product = await f.AddProductAsync("Shampoo", lastPurchased: declared);
        var item = Assert.Single(await f.SyncAsync());

        var bought = await f.SetPurchasedAsync(item.Id, true);
        Assert.Equal(RestockStatus.Ok, bought!.ProductStatus);
        Assert.Equal(new DateOnly(2026, 11, 4), product.LastPurchasedOn);
        var purchase = Assert.Single(await f.Db.ProductEvents.OfType<ProductPurchased>().ToListAsync(Ct));
        Assert.Equal(item.Id, purchase.ShoppingItemId);
        Assert.Equal(item.Id, Assert.Single(await f.SyncAsync()).Id); // no new pending item

        var undone = await f.SetPurchasedAsync(item.Id, false);
        Assert.Equal(declared, product.LastPurchasedOn);
        Assert.Equal(RestockStatus.Due, undone!.ProductStatus);
        Assert.Equal(
            purchase.Id,
            Assert.Single(await f.Db.ProductEvents.OfType<ProductPurchaseReverted>().ToListAsync(Ct)).PurchaseEventId
        );
        Assert.Equal(item.Id, Assert.Single(await f.SyncAsync()).Id); // still a single pending item
    }

    [Fact]
    public async Task CheckingAnItemTwice_DoesNotLogTwice()
    {
        await using var f = await Fixture.CreateAsync();
        await f.AddProductAsync("Shampoo");
        var item = Assert.Single(await f.SyncAsync());

        await f.SetPurchasedAsync(item.Id, true);
        await f.SetPurchasedAsync(item.Id, true);

        Assert.Single(await f.Db.ProductEvents.OfType<ProductPurchased>().ToListAsync(Ct));
    }

    // ---- Make recurring ----

    [Fact]
    public async Task MakeRecurring_CreatesTheProduct_AndLinksTheItem()
    {
        await using var f = await Fixture.CreateAsync();
        var item = await new CreateShoppingItemCommandHandler(f.Db, f.Tenant, f.Clock).Handle(
            new("Papel de baño", 4, MeasurementUnit.Piece),
            Ct
        );

        var linked = await new MakeShoppingItemRecurringCommandHandler(f.Db, f.Clock).Handle(
            new(item.Id, ProductCategory.Cleaning, 14),
            Ct
        );

        var product = Assert.Single(await f.Db.Products.ToListAsync(Ct));
        Assert.Equal(
            ("Papel de baño", 4m, MeasurementUnit.Piece, 14),
            (product.Name, product.DefaultQuantity!.Value, product.DefaultUnit!.Value, product.RestockIntervalDays!.Value)
        );
        Assert.Equal(product.Id, linked!.ProductId);
        Assert.Equal(ShoppingItemSource.Recurring, linked.Source);
        Assert.Equal(item.Id, Assert.Single(await f.SyncAsync()).Id); // sync doesn't duplicate it
    }

    [Fact]
    public async Task MakeRecurring_WhenTheProductIsAlreadyOnTheList_DropsTheDuplicate()
    {
        await using var f = await Fixture.CreateAsync();
        var product = await f.AddProductAsync("Shampoo");
        var listed = Assert.Single(await f.SyncAsync());
        var manual = await new CreateShoppingItemCommandHandler(f.Db, f.Tenant, f.Clock).Handle(new("shampoo", null, null), Ct);

        var result = await new MakeShoppingItemRecurringCommandHandler(f.Db, f.Clock).Handle(
            new(manual.Id, ProductCategory.Hygiene, null),
            Ct
        );

        Assert.Equal(listed.Id, result!.Id);
        Assert.Equal(product.Id, Assert.Single(await f.Db.ShoppingItems.ToListAsync(Ct)).ProductId);
    }

    // ---- Tenancy ----

    [Fact]
    public async Task Sync_OnlyTouchesTheCurrentHousehold()
    {
        await using var f = await Fixture.CreateAsync();
        var other = Household.Create("Otra", "UTC");
        f.Db.Households.Add(other);
        f.Db.Products.Add(
            Product.Create(other.Id, "Ajeno", ProductCategory.Other, 1, MeasurementUnit.Piece, 7, null, Wednesday.UtcDateTime)
        );
        await f.Db.SaveChangesAsync(Ct);

        Assert.Empty(await f.SyncAsync());
        Assert.Empty(await f.Db.ShoppingItems.IgnoreQueryFilters().ToListAsync(Ct));
    }
}
