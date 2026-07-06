using Microsoft.AspNetCore.Identity;

namespace ComeRico.Core.Domain.Entities;

/// <summary>
/// Application user (ASP.NET Core Identity). A user may exist without a household
/// (HouseholdId is nullable) until they create or join one.
/// </summary>
public class AppUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = string.Empty;
    public Guid? HouseholdId { get; private set; }
    public HouseholdRole Role { get; private set; } = HouseholdRole.Member;
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;

    public Household? Household { get; private set; }

    public void JoinHousehold(Guid householdId, HouseholdRole role)
    {
        HouseholdId = householdId;
        Role = role;
    }

    public void LeaveHousehold()
    {
        HouseholdId = null;
        Role = HouseholdRole.Member;
    }

    public void PromoteToAdmin() => Role = HouseholdRole.Admin;
}

public enum HouseholdRole
{
    Member,
    Admin,
}
