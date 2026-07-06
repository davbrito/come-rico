using ComeRico.Core.Domain.Entities;

namespace ComeRico.Tests;

public class HouseholdTests
{
    [Fact]
    public void Create_GeneratesUniqueInviteCodes()
    {
        const int count = 100;
        var codes = new HashSet<string>(count);

        for (var i = 0; i < count; i++)
        {
            var household = Household.Create($"Household {i}");
            var added = codes.Add(household.InviteCode);
            Assert.True(added, $"Duplicate InviteCode '{household.InviteCode}' generated at iteration {i}.");
        }
    }

    [Fact]
    public void Create_ProducesInviteCodeOfExpectedFormat()
    {
        var household = Household.Create("Test");

        Assert.NotNull(household.InviteCode);
        Assert.Equal(8, household.InviteCode.Length);
        Assert.Matches("^[0-9A-F]{8}$", household.InviteCode);
    }

    [Fact]
    public void RotateInviteCode_ChangesToNewCode()
    {
        var household = Household.Create("Test");

        var originalCode = household.InviteCode;
        household.RotateInviteCode();

        Assert.NotNull(household.InviteCode);
        Assert.Equal(8, household.InviteCode.Length);
        Assert.Matches("^[0-9A-F]{8}$", household.InviteCode);
        Assert.NotEqual(originalCode, household.InviteCode);
    }
}
