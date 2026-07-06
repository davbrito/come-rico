using ComeRico.Api.Endpoints;
using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using ComeRico.Core.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Tests;

public class HouseholdMembershipHelperTests
{
    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options, new FakeTenantService());
    }

    private static AppUser CreateMember(Guid householdId, HouseholdRole role, DateTime createdAt)
    {
        var user = new AppUser { DisplayName = "Member", UserName = Guid.NewGuid().ToString() };
        user.JoinHousehold(householdId, role);
        typeof(AppUser).GetProperty(nameof(AppUser.CreatedAt))!.SetValue(user, createdAt);
        return user;
    }

    [Fact]
    public async Task DoesNothing_WhenLeavingUserIsNotAdmin()
    {
        await using var db = CreateContext();
        var householdId = Guid.CreateVersion7();
        var leavingUser = CreateMember(householdId, HouseholdRole.Member, DateTime.UtcNow);
        var otherMember = CreateMember(householdId, HouseholdRole.Member, DateTime.UtcNow);
        db.Users.AddRange(leavingUser, otherMember);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);

        await HouseholdMembershipHelper.PromoteFallbackAdminIfNeededAsync(db, leavingUser, TestContext.Current.CancellationToken);

        Assert.Equal(HouseholdRole.Member, otherMember.Role);
    }

    [Fact]
    public async Task DoesNothing_WhenLeavingUserHasNoHousehold()
    {
        await using var db = CreateContext();
        var leavingUser = new AppUser { DisplayName = "Solo", UserName = "solo" };
        db.Users.Add(leavingUser);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);

        await HouseholdMembershipHelper.PromoteFallbackAdminIfNeededAsync(db, leavingUser, TestContext.Current.CancellationToken);

        Assert.Null(leavingUser.HouseholdId);
    }

    [Fact]
    public async Task DoesNothing_WhenAnotherAdminAlreadyExists()
    {
        await using var db = CreateContext();
        var householdId = Guid.CreateVersion7();
        var leavingUser = CreateMember(householdId, HouseholdRole.Admin, DateTime.UtcNow);
        var otherAdmin = CreateMember(householdId, HouseholdRole.Admin, DateTime.UtcNow);
        var member = CreateMember(householdId, HouseholdRole.Member, DateTime.UtcNow);
        db.Users.AddRange(leavingUser, otherAdmin, member);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);

        await HouseholdMembershipHelper.PromoteFallbackAdminIfNeededAsync(db, leavingUser, TestContext.Current.CancellationToken);

        Assert.Equal(HouseholdRole.Admin, otherAdmin.Role);
        Assert.Equal(HouseholdRole.Member, member.Role);
    }

    [Fact]
    public async Task DoesNothing_WhenLeavingUserIsSoleMemberOfHousehold()
    {
        await using var db = CreateContext();
        var householdId = Guid.CreateVersion7();
        var leavingUser = CreateMember(householdId, HouseholdRole.Admin, DateTime.UtcNow);
        db.Users.Add(leavingUser);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);

        await HouseholdMembershipHelper.PromoteFallbackAdminIfNeededAsync(db, leavingUser, TestContext.Current.CancellationToken);

        Assert.Equal(HouseholdRole.Admin, leavingUser.Role);
    }

    [Fact]
    public async Task PromotesLongestStandingMember_WhenNoOtherAdminExists()
    {
        await using var db = CreateContext();
        var householdId = Guid.CreateVersion7();
        var now = DateTime.UtcNow;
        var leavingUser = CreateMember(householdId, HouseholdRole.Admin, now);
        var oldestMember = CreateMember(householdId, HouseholdRole.Member, now.AddDays(-2));
        var newerMember = CreateMember(householdId, HouseholdRole.Member, now.AddDays(-1));
        db.Users.AddRange(leavingUser, oldestMember, newerMember);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);

        await HouseholdMembershipHelper.PromoteFallbackAdminIfNeededAsync(db, leavingUser, TestContext.Current.CancellationToken);

        Assert.Equal(HouseholdRole.Admin, oldestMember.Role);
        Assert.Equal(HouseholdRole.Member, newerMember.Role);
    }

    private sealed class FakeTenantService : ITenantService
    {
        public Guid HouseholdId => Guid.Empty;
    }
}
