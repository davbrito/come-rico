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
    public async Task Create_WithLastPurchase_DeclaresItWithoutRecordingARealPurchase()
    {
        var household = Guid.CreateVersion7();
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household);
        var (create, user) = Setup(db, household);

        var dto = await create.Handle(NewCommand(new DateOnly(2026, 10, 1)), Ct);

        Assert.Equal("Head", dto.PreferredBrand);
        Assert.Equal(new DateOnly(2026, 10, 1), dto.LastPurchasedOn);
        Assert.Equal(RestockStatus.Due, dto.Status);
        var declared = Assert.IsType<ProductLastPurchaseDeclared>(Assert.Single(await db.ProductEvents.ToListAsync(Ct)));
        Assert.Equal(user, declared.UserId);
        Assert.Equal(household, declared.HouseholdId);
        Assert.Equal(new DateOnly(2026, 10, 1), declared.DeclaredOn);
        Assert.Empty(await db.ProductEvents.OfType<ProductPurchased>().ToListAsync(Ct));
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

        var back = await new MarkProductInStockCommandHandler(db, tenant, who, Clock).Handle(new(created.Id), Ct);
        Assert.Equal(RestockStatus.Ok, back!.Status);
        await new MarkProductInStockCommandHandler(db, tenant, who, Clock).Handle(new(created.Id), Ct); // no-op: not out of stock
        Assert.Single(await db.ProductEvents.OfType<ProductMarkedInStock>().ToListAsync(Ct));
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
            new SnoozeProductCommandHandler(db, who, Clock).Handle(new(created.Id, 7), Ct)
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

        var result = await new SnoozeProductCommandHandler(db, new FakeCurrentUserService(user), Clock).Handle(
            new(created.Id, 7),
            Ct
        );

        Assert.Equal(new DateOnly(2026, 11, 11), result!.SnoozedUntil);
        Assert.NotEqual(RestockStatus.Due, result.Status);
        Assert.Equal(7, Assert.Single(await db.ProductEvents.OfType<ProductSnoozed>().ToListAsync(Ct)).Days);
    }

    [Fact]
    public async Task Snooze_WithShoppingDay_NeverEndsBeforeTheDayAfterNextShopping()
    {
        var household = Household.Create("Casa", "UTC");
        household.SetShoppingDay(DayOfWeek.Saturday); // next Saturday is 7 Nov; the day after is 8 Nov
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household.Id);
        db.Households.Add(household);
        await db.SaveChangesAsync(Ct);
        var (create, user) = Setup(db, household.Id);
        var created = await create.Handle(NewCommand(new DateOnly(2026, 10, 1)), Ct);

        var result = await new SnoozeProductCommandHandler(db, new FakeCurrentUserService(user), Clock).Handle(
            new(created.Id, 3),
            Ct
        );

        Assert.Equal(new DateOnly(2026, 11, 8), result!.SnoozedUntil);
        Assert.NotEqual(RestockStatus.Due, result.Status);
    }

    [Fact]
    public async Task Update_RecordsIntervalChange_AndDeclaredDate_WithoutTouchingStockState()
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
        Assert.Equal(2, await db.ProductEvents.OfType<ProductLastPurchaseDeclared>().CountAsync(Ct));
        Assert.Empty(await db.ProductEvents.OfType<ProductPurchased>().ToListAsync(Ct));
    }

    [Fact]
    public async Task Update_DeclaringTheDate_KeepsOutOfStockAndSnooze()
    {
        var household = Guid.CreateVersion7();
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household);
        var (create, user) = Setup(db, household);
        var created = await create.Handle(NewCommand(new DateOnly(2026, 10, 1)), Ct);
        var tenant = new FakeTenantService(household);
        var who = new FakeCurrentUserService(user);
        await new MarkProductOutOfStockCommandHandler(db, tenant, who, Clock).Handle(new(created.Id), Ct);

        var updated = await new UpdateProductCommandHandler(db, tenant, who, Clock).Handle(
            new(created.Id, "Shampoo", ProductCategory.Hygiene, 1, MeasurementUnit.Package, 14, null, new DateOnly(2026, 10, 20)),
            Ct
        );

        Assert.Equal(RestockStatus.OutOfStock, updated!.Status);
    }

    [Fact]
    public async Task Snooze_Again_NeverShortensAnExistingSnooze()
    {
        var household = Guid.CreateVersion7();
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household);
        var (create, user) = Setup(db, household);
        var created = await create.Handle(NewCommand(new DateOnly(2026, 10, 1)), Ct);
        var handler = new SnoozeProductCommandHandler(db, new FakeCurrentUserService(user), Clock);

        await handler.Handle(new(created.Id, 14), Ct);
        var again = await handler.Handle(new(created.Id, 3), Ct);

        Assert.Equal(new DateOnly(2026, 11, 18), again!.SnoozedUntil);
        Assert.Equal(new DateOnly(2026, 11, 18), again.NextDueOn);
    }

    [Fact]
    public async Task Today_IsTheHouseholdsLocalDate_NotUtc()
    {
        // 2026-11-05 02:00 UTC is still Wednesday 4 Nov 22:00 in Caracas (UTC-4).
        var lateUtc = new FixedClock(new DateTimeOffset(2026, 11, 5, 2, 0, 0, TimeSpan.Zero));
        var household = Household.Create("Casa", "America/Caracas");
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household.Id);
        db.Households.Add(household);
        await db.SaveChangesAsync(Ct);
        var create = new CreateProductCommandHandler(
            db,
            new FakeTenantService(household.Id),
            new FakeCurrentUserService(Guid.CreateVersion7()),
            lateUtc
        );

        // Buying "today" locally (4 Nov) is valid even though UTC is already the 5th...
        var ok = await create.Handle(NewCommand(new DateOnly(2026, 11, 4)), Ct);
        Assert.Equal(RestockStatus.Ok, ok.Status);

        // ...but the 5th is still in the future for this household.
        await Assert.ThrowsAsync<FluentValidation.ValidationException>(() =>
            create.Handle(NewCommand(new DateOnly(2026, 11, 5)), Ct)
        );
    }

    [Fact]
    public async Task Today_AheadOfUtc_AcceptsTheLocalDate()
    {
        // 2026-11-04 23:00 UTC is already Thursday 5 Nov in Auckland (UTC+13).
        var clock = new FixedClock(new DateTimeOffset(2026, 11, 4, 23, 0, 0, TimeSpan.Zero));
        var household = Household.Create("Casa", "Pacific/Auckland");
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household.Id);
        db.Households.Add(household);
        await db.SaveChangesAsync(Ct);
        var create = new CreateProductCommandHandler(
            db,
            new FakeTenantService(household.Id),
            new FakeCurrentUserService(Guid.CreateVersion7()),
            clock
        );

        var dto = await create.Handle(NewCommand(new DateOnly(2026, 11, 5)), Ct);

        Assert.Equal(new DateOnly(2026, 11, 5), dto.LastPurchasedOn);
    }

    [Fact]
    public void Validator_RejectsIntervalsBelowTwoDays()
    {
        var validator = new CreateProductCommandValidator();
        Assert.False(validator.Validate(NewCommand(interval: 1)).IsValid);
        Assert.True(validator.Validate(NewCommand(interval: 2)).IsValid);
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
        var household = Household.Create("Casa", "UTC");
        household.SetShoppingDay(DayOfWeek.Saturday);
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), household.Id);
        db.Households.Add(household);
        await db.SaveChangesAsync(Ct);
        var (create, _) = Setup(db, household.Id);
        await create.Handle(NewCommand(new DateOnly(2026, 10, 24)), Ct); // due 7 Nov == next shopping day

        var products = await new GetProductsQueryHandler(db, Clock).Handle(new(), Ct);

        Assert.Equal(RestockStatus.Due, Assert.Single(products).Status);
    }
}
