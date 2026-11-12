using Microsoft.AspNetCore.Identity;

namespace ComeRico.Core.Domain.Entities;

/// <summary>
/// Application user (ASP.NET Core Identity). A user may exist without a household
/// (HouseholdId is nullable) until they create or join one.
/// Identity (credentials, MFA, social login) lives in WorkOS AuthKit; this is our
/// own user + household model, tied to the WorkOS user by <see cref="WorkOsUserId"/>.
/// </summary>
public class AppUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = string.Empty;
    public Guid? HouseholdId { get; private set; }
    public HouseholdRole Role { get; private set; } = HouseholdRole.Member;
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;

    /// <summary>
    /// WorkOS user id (<c>user_…</c>), unique. Null for accounts created before the
    /// migration to AuthKit until their first AuthKit login links them by email.
    /// </summary>
    public string? WorkOsUserId { get; private set; }

    public Household? Household { get; private set; }

    public void LinkWorkOsUser(string workOsUserId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workOsUserId);
        if (WorkOsUserId is not null && WorkOsUserId != workOsUserId)
            throw new InvalidOperationException("La cuenta ya está vinculada a otro usuario de WorkOS.");
        WorkOsUserId = workOsUserId;
    }

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
