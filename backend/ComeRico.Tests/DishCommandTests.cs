using ComeRico.Core.Features.Dishes.Commands;
using ComeRico.Core.Features.Dishes.Queries;
using ComeRico.Core.Domain.Entities;

namespace ComeRico.Tests;

public class DishCommandTests
{
    [Fact]
    public async Task Create_StampsHouseholdId_OnDishAndIngredients()
    {
        var householdId = Guid.CreateVersion7();
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), householdId);

        var handler = new CreateDishCommandHandler(db, new FakeTenantService(householdId), new FakeFileStorage());
        var result = await handler.Handle(
            new CreateDishCommand("Tacos", "Weeknight tacos", null, [new IngredientInput("Tortillas", 8, MeasurementUnit.Piece)]),
            TestContext.Current.CancellationToken
        );

        Assert.Equal(householdId, result.HouseholdId);
        Assert.Single(result.Ingredients);
        var storedDish = await db.Dishes.FindAsync([result.Id], TestContext.Current.CancellationToken);
        Assert.Equal(householdId, storedDish!.HouseholdId);
    }

    [Fact]
    public async Task GetDishes_CreatedUnderOneHousehold_IsInvisibleFromAnother()
    {
        var dbName = Guid.NewGuid().ToString();
        var householdA = Guid.CreateVersion7();
        var householdB = Guid.CreateVersion7();

        await using (var dbA = TestDb.Create(dbName, householdA))
        {
            var handlerA = new CreateDishCommandHandler(dbA, new FakeTenantService(householdA), new FakeFileStorage());
            await handlerA.Handle(new CreateDishCommand("A's dish", null, null), TestContext.Current.CancellationToken);
        }

        await using var dbB = TestDb.Create(dbName, householdB);
        var queryHandler = new GetDishesQueryHandler(dbB, new FakeFileStorage());
        var result = await queryHandler.Handle(new GetDishesQuery(), TestContext.Current.CancellationToken);

        Assert.Empty(result);
    }
}
