using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Commands;
using ComeRico.Core.Features.Products.Queries;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Tests;

public class ProductCommandTests
{
    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private static readonly TimeProvider Clock = new FixedClock(new DateTimeOffset(2026, 11, 4, 12, 0, 0, TimeSpan.Zero)); // Wednesday
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static (CreateProductCommandHandler Create, Guid User) Setup(Core.Interfaces.IAppDbContext db, Guid householdId)
    {
        var user = Guid.CreateVersion7();
        return (
            new CreateProductCommandHandler(db, new FakeTenantService(householdId), new FakeCurrentUserService(user), Clock),
            user
        );
    }

    private static CreateProductCommand NewCommand(DateOnly? last = null, int? interval = 14) =>
        new("Shampoo", ProductCategory.Hygiene, 1, MeasurementUnit.Package, interval, "  Head  ", last);

    [Fact]
    public async Task Create_WithLastPurchase_RecordsPurchaseEventAndCache()
    {
        var household = Guid.CreateVersion7();
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household);
        var (create, user) = Setup(db, household);

        var dto = await create.Handle(NewCommand(new DateOnly(2026, 10, 1)), Ct);

        Assert.Equal("Head", dto.PreferredBrand);
        Assert.Equal(new DateOnly(2026, 10, 1), dto.LastPurchasedOn);
        Assert.Equal(RestockStatus.Due, dto.Status);
        var purchase = Assert.IsType<ProductPurchased>(Assert.Single(await db.ProductEvents.ToListAsync(Ct)));
        Assert.Equal(user, purchase.UserId);
        Assert.Equal(household, purchase.HouseholdId);
        Assert.Equal(1, purchase.Quantity);
        Assert.Equal(MeasurementUnit.Package, purchase.Unit);
    }

    [Fact]
    public async Task Create_WithoutLastPurchase_CountsAsDue_AndLogsNothing()
    {
        var household = Guid.CreateVersion7();
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household);
        var (create, _) = Setup(db, household);

        var dto = await create.Handle(NewCommand(), Ct);

        Assert.Equal(RestockStatus.Due, dto.Status);
        Assert.Empty(await db.ProductEvents.ToListAsync(Ct));
    }

    [Fact]
    public async Task OutOfStock_ThenInStock_TogglesStatus_AndLogsOnce()
    {
        var household = Guid.CreateVersion7();
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household);
        var (create, user) = Setup(db, household);
        var created = await create.Handle(NewCommand(new DateOnly(2026, 11, 3), interval: null), Ct);
        var tenant = new FakeTenantService(household);
        var who = new FakeCurrentUserService(user);

        var gone = await new MarkProductOutOfStockCommandHandler(db, tenant, who, Clock).Handle(new(created.Id), Ct);
        await new MarkProductOutOfStockCommandHandler(db, tenant, who, Clock).Handle(new(created.Id), Ct); // idempotent
        Assert.Equal(RestockStatus.OutOfStock, gone!.Status);
        Assert.Single(await db.ProductEvents.OfType<ProductMarkedOutOfStock>().ToListAsync(Ct));

        var back = await new MarkProductInStockCommandHandler(db, Clock).Handle(new(created.Id), Ct);
        Assert.Equal(RestockStatus.Ok, back!.Status);
    }

    [Fact]
    public async Task Snooze_OfOutOfStockProduct_IsRejected()
    {
        var household = Guid.CreateVersion7();
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household);
        var (create, user) = Setup(db, household);
        var created = await create.Handle(NewCommand(new DateOnly(2026, 10, 1)), Ct);
        var tenant = new FakeTenantService(household);
        var who = new FakeCurrentUserService(user);
        await new MarkProductOutOfStockCommandHandler(db, tenant, who, Clock).Handle(new(created.Id), Ct);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            new SnoozeProductCommandHandler(db, tenant, who, Clock).Handle(new(created.Id, 7), Ct)
        );
    }

    [Fact]
    public async Task Snooze_DefersDueProduct_AndLogsDays()
    {
        var household = Guid.CreateVersion7();
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household);
        var (create, user) = Setup(db, household);
        var created = await create.Handle(NewCommand(new DateOnly(2026, 10, 1)), Ct);
        Assert.Equal(RestockStatus.Due, created.Status);

        var result = await new SnoozeProductCommandHandler(
            db,
            new FakeTenantService(household),
            new FakeCurrentUserService(user),
            Clock
        ).Handle(new(created.Id, 7), Ct);

        Assert.Equal(new DateOnly(2026, 11, 11), result!.SnoozedUntil);
        Assert.NotEqual(RestockStatus.Due, result.Status);
        Assert.Equal(7, Assert.Single(await db.ProductEvents.OfType<ProductSnoozed>().ToListAsync(Ct)).Days);
    }

    [Fact]
    public async Task Snooze_WithShoppingDay_NeverEndsBeforeTheDayAfterNextShopping()
    {
        var household = Household.Create("Casa");
        household.SetShoppingDay(DayOfWeek.Saturday); // next Saturday is 7 Nov; the day after is 8 Nov
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household.Id);
        db.Households.Add(household);
        var (create, user) = Setup(db, household.Id);
        var created = await create.Handle(NewCommand(new DateOnly(2026, 10, 1)), Ct);

        var result = await new SnoozeProductCommandHandler(
            db,
            new FakeTenantService(household.Id),
            new FakeCurrentUserService(user),
            Clock
        ).Handle(new(created.Id, 3), Ct);

        Assert.Equal(new DateOnly(2026, 11, 8), result!.SnoozedUntil);
        Assert.NotEqual(RestockStatus.Due, result.Status);
    }

    [Fact]
    public async Task Update_RecordsIntervalChange_AndPurchaseWhenDateChanges()
    {
        var household = Guid.CreateVersion7();
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household);
        var (create, user) = Setup(db, household);
        var created = await create.Handle(NewCommand(new DateOnly(2026, 10, 1)), Ct);

        var updated = await new UpdateProductCommandHandler(
            db,
            new FakeTenantService(household),
            new FakeCurrentUserService(user),
            Clock
        ).Handle(
            new(created.Id, "Shampoo", ProductCategory.Hygiene, 1, MeasurementUnit.Package, 30, null, new DateOnly(2026, 11, 1)),
            Ct
        );

        Assert.Equal(30, updated!.RestockIntervalDays);
        Assert.Equal(new DateOnly(2026, 11, 1), updated.LastPurchasedOn);
        var change = Assert.Single(await db.ProductEvents.OfType<ProductIntervalChanged>().ToListAsync(Ct));
        Assert.Equal((14, 30), (change.OldDays, change.NewDays));
        Assert.Equal(2, await db.ProductEvents.OfType<ProductPurchased>().CountAsync(Ct));
    }

    [Fact]
    public async Task Delete_DeactivatesProduct_ButKeepsHistory()
    {
        var household = Guid.CreateVersion7();
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household);
        var (create, _) = Setup(db, household);
        var created = await create.Handle(NewCommand(new DateOnly(2026, 10, 1)), Ct);

        Assert.True(await new DeleteProductCommandHandler(db).Handle(new(created.Id), Ct));
        Assert.False(await new DeleteProductCommandHandler(db).Handle(new(created.Id), Ct));

        Assert.Empty(await new GetProductsQueryHandler(db, Clock).Handle(new(), Ct));
        Assert.Single(await db.ProductEvents.ToListAsync(Ct));
    }

    [Fact]
    public async Task GetProducts_ReturnsStatusRelativeToHouseholdShoppingDay()
    {
        var household = Household.Create("Casa");
        household.SetShoppingDay(DayOfWeek.Saturday);
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household.Id);
        db.Households.Add(household);
        var (create, _) = Setup(db, household.Id);
        await create.Handle(NewCommand(new DateOnly(2026, 10, 24)), Ct); // due 7 Nov == next shopping day

        var products = await new GetProductsQueryHandler(db, Clock).Handle(new(), Ct);

        Assert.Equal(RestockStatus.Due, Assert.Single(products).Status);
    }
}
