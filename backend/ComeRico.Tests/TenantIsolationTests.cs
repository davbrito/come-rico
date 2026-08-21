using ComeRico.Core.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Tests;

public class TenantIsolationTests
{
    [Fact]
    public async Task Dishes_QueriedFromOtherHousehold_AreInvisible()
    {
        var dbName = Guid.NewGuid().ToString();
        var householdA = Guid.CreateVersion7();
        var householdB = Guid.CreateVersion7();

        await using (var dbA = TestDb.Create(dbName, householdA))
        {
            dbA.Dishes.Add(Dish.Create(householdA, "A's dish"));
            await dbA.SaveChangesAsync(TestContext.Current.CancellationToken);
        }

        await using var dbB = TestDb.Create(dbName, householdB);
        dbB.Dishes.Add(Dish.Create(householdB, "B's dish"));
        await dbB.SaveChangesAsync(TestContext.Current.CancellationToken);

        var visibleToB = await dbB.Dishes.ToListAsync(TestContext.Current.CancellationToken);

        Assert.Single(visibleToB);
        Assert.Equal("B's dish", visibleToB[0].Name);
    }

    [Fact]
    public async Task Tags_QueriedFromOtherHousehold_AreInvisible()
    {
        var dbName = Guid.NewGuid().ToString();
        var householdA = Guid.CreateVersion7();
        var householdB = Guid.CreateVersion7();

        await using (var dbA = TestDb.Create(dbName, householdA))
        {
            dbA.Tags.Add(Tag.Create(householdA, "Vegetarian"));
            await dbA.SaveChangesAsync(TestContext.Current.CancellationToken);
        }

        await using var dbB = TestDb.Create(dbName, householdB);

        var visibleToB = await dbB.Tags.ToListAsync(TestContext.Current.CancellationToken);

        Assert.Empty(visibleToB);
    }

    [Fact]
    public async Task Dish_FetchedByIdFromOtherHousehold_ReturnsNull()
    {
        var dbName = Guid.NewGuid().ToString();
        var householdA = Guid.CreateVersion7();
        var householdB = Guid.CreateVersion7();
        Guid dishId;

        await using (var dbA = TestDb.Create(dbName, householdA))
        {
            var dish = Dish.Create(householdA, "A's dish");
            dishId = dish.Id;
            dbA.Dishes.Add(dish);
            await dbA.SaveChangesAsync(TestContext.Current.CancellationToken);
        }

        await using var dbB = TestDb.Create(dbName, householdB);
        var found = await dbB.Dishes.FirstOrDefaultAsync(d => d.Id == dishId, TestContext.Current.CancellationToken);

        Assert.Null(found);
    }
}
