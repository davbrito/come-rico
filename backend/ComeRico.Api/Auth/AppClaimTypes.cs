namespace ComeRico.Api.Auth;

/// <summary>
/// Custom claim types embedded in the authentication cookie.
/// </summary>
public static class AppClaimTypes
{
    public const string HouseholdId = "household_id";
    public const string HouseholdRole = "household_role";
    public const string DisplayName = "display_name";
}
