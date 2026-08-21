using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Households.Commands;

namespace ComeRico.Tests;

public class HouseholdCommandTests
{
    [Fact]
    public async Task Create_CreatesHousehold_AndPromotesUserToAdmin()
    {
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), Guid.Empty);
        var user = new AppUser { DisplayName = "Alice", UserName = "alice" };
        db.Users.Add(user);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);

        var handler = new CreateHouseholdCommandHandler(db, new FakeCurrentUserService(user.Id));
        var result = await handler.Handle(new CreateHouseholdCommand("The Smiths"), TestContext.Current.CancellationToken);

        Assert.Equal("The Smiths", result.Name);
        Assert.Equal(result.Id, user.HouseholdId);
        Assert.Equal(HouseholdRole.Admin, user.Role);
    }

    [Fact]
    public async Task Create_Throws_WhenUserAlreadyHasHousehold()
    {
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), Guid.Empty);
        var user = new AppUser { DisplayName = "Alice", UserName = "alice" };
        user.JoinHousehold(Guid.CreateVersion7(), HouseholdRole.Member);
        db.Users.Add(user);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);

        var handler = new CreateHouseholdCommandHandler(db, new FakeCurrentUserService(user.Id));

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.Handle(new CreateHouseholdCommand("New Household"), TestContext.Current.CancellationToken)
        );
    }

    [Fact]
    public async Task Join_AddsUserAsMember_WhenInviteCodeIsValid()
    {
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), Guid.Empty);
        var household = Household.Create("The Smiths");
        var user = new AppUser { DisplayName = "Bob", UserName = "bob" };
        db.Households.Add(household);
        db.Users.Add(user);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);

        var handler = new JoinHouseholdCommandHandler(db, new FakeCurrentUserService(user.Id));
        var lowercaseCodeWithSpaces = $"  {household.InviteCode.ToLowerInvariant()}  ";
        var result = await handler.Handle(new JoinHouseholdCommand(lowercaseCodeWithSpaces), TestContext.Current.CancellationToken);

        Assert.Equal(household.Id, result.Id);
        Assert.Equal(household.Id, user.HouseholdId);
        Assert.Equal(HouseholdRole.Member, user.Role);
    }

    [Fact]
    public async Task Join_Throws_WhenInviteCodeDoesNotExist()
    {
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), Guid.Empty);
        var user = new AppUser { DisplayName = "Bob", UserName = "bob" };
        db.Users.Add(user);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);

        var handler = new JoinHouseholdCommandHandler(db, new FakeCurrentUserService(user.Id));

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.Handle(new JoinHouseholdCommand("NOPE0000"), TestContext.Current.CancellationToken)
        );
        Assert.Null(user.HouseholdId);
    }

    [Fact]
    public async Task Join_Throws_WhenUserAlreadyHasHousehold()
    {
        await using var db = TestDb.Create(Guid.NewGuid().ToString(), Guid.Empty);
        var existingHouseholdId = Guid.CreateVersion7();
        var household = Household.Create("The Joneses");
        var user = new AppUser { DisplayName = "Bob", UserName = "bob" };
        user.JoinHousehold(existingHouseholdId, HouseholdRole.Member);
        db.Households.Add(household);
        db.Users.Add(user);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);

        var handler = new JoinHouseholdCommandHandler(db, new FakeCurrentUserService(user.Id));

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.Handle(new JoinHouseholdCommand(household.InviteCode), TestContext.Current.CancellationToken)
        );
        Assert.Equal(existingHouseholdId, user.HouseholdId);
    }
}
