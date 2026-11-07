using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Dishes.Commands;
using ComeRico.Core.Features.Households.Commands;
using ComeRico.Core.Features.MealPlans.Commands;

namespace ComeRico.Tests;

public class PortionsTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData(1, 4, 2, 0.5)]
    [InlineData(100, 2, 6, 300)]
    [InlineData(3, 3, 3, 3)]
    public void Scale_IsQuantityTimesPlannedOverYield(decimal quantity, int yields, int planned, decimal expected) =>
        Assert.Equal(expected, Portions.Scale(quantity, planned, yields));

    private static async Task<(Infrastructure.Persistence.AppDbContext Db, Household Household)> SetupAsync(int defaultServings)
    {
        var household = Household.Create("Casa", "UTC");
        household.SetDefaultServings(defaultServings);
        var db = TestDb.Create(Guid.NewGuid().ToString(), household.Id);
        db.Households.Add(household);
        await db.SaveChangesAsync(Ct);
        return (db, household);
    }

    [Fact]
    public async Task CreateDish_WithoutServings_UsesTheHouseholdDefault()
    {
        var (db, household) = await SetupAsync(defaultServings: 4);
        await using var _ = db;
        var handler = new CreateDishCommandHandler(db, new FakeTenantService(household.Id), new FakeFileStorage());

        var implicitYield = await handler.Handle(new CreateDishCommand("Tacos", null, null), Ct);
        var explicitYield = await handler.Handle(new CreateDishCommand("Sopa", null, null, null, Servings: 6), Ct);

        Assert.Equal(4, implicitYield.Servings);
        Assert.Equal(6, explicitYield.Servings);
    }

    [Fact]
    public async Task CreateMealPlan_WithoutServings_UsesTheHouseholdDefault_AndCanBeChanged()
    {
        var (db, household) = await SetupAsync(defaultServings: 3);
        await using var _ = db;
        var dish = Dish.Create(household.Id, "Tacos", servings: 2);
        db.Dishes.Add(dish);
        await db.SaveChangesAsync(Ct);
        var create = new CreateMealPlanCommandHandler(db, new FakeTenantService(household.Id), new FakeFileStorage());

        var plan = await create.Handle(new CreateMealPlanCommand(dish.Id, new DateOnly(2026, 11, 5), MealType.Lunch), Ct);
        Assert.Equal((3, 2), (plan.Servings, plan.DishServings));

        var changed = await new SetMealPlanServingsCommandHandler(db, new FakeFileStorage()).Handle(new(plan.Id, 5), Ct);
        Assert.Equal(5, changed!.Servings);
    }

    [Theory]
    [InlineData(0, false)]
    [InlineData(1, true)]
    [InlineData(50, true)]
    [InlineData(51, false)]
    public void Validators_BoundServings(int servings, bool valid)
    {
        Assert.Equal(
            valid,
            new CreateDishCommandValidator().Validate(new CreateDishCommand("x", null, null, null, servings)).IsValid
        );
        Assert.Equal(
            valid,
            new CreateMealPlanCommandValidator()
                .Validate(new CreateMealPlanCommand(Guid.NewGuid(), new DateOnly(2026, 11, 5), MealType.Lunch, servings))
                .IsValid
        );
        Assert.Equal(
            valid,
            new SetMealPlanServingsCommandValidator().Validate(new SetMealPlanServingsCommand(Guid.NewGuid(), servings)).IsValid
        );
        Assert.Equal(
            valid,
            new UpdateHouseholdSettingsCommandValidator()
                .Validate(new UpdateHouseholdSettingsCommand(null, "USD", "UTC", servings))
                .IsValid
        );
    }

    [Fact]
    public async Task HouseholdSettings_UpdateDefaultServings_NullKeepsIt()
    {
        var (db, household) = await SetupAsync(defaultServings: 2);
        await using var _ = db;
        var handler = new UpdateHouseholdSettingsCommandHandler(db, new FakeTenantService(household.Id));

        Assert.Equal(4, (await handler.Handle(new(null, "USD", "UTC", 4), Ct)).DefaultServings);
        Assert.Equal(4, (await handler.Handle(new(null, "USD", "UTC"), Ct)).DefaultServings);
    }
}
