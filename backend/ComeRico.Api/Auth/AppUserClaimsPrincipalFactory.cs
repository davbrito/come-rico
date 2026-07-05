using System.Security.Claims;
using ComeRico.Core.Domain.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace ComeRico.Api.Auth;

/// <summary>
/// Adds ComeRico-specific claims (household, role, display name) to the principal
/// stored in the authentication cookie. The household claim is what the tenant
/// service — and therefore every EF Core global query filter — relies on.
/// </summary>
public sealed class AppUserClaimsPrincipalFactory(UserManager<AppUser> userManager, IOptions<IdentityOptions> optionsAccessor)
    : UserClaimsPrincipalFactory<AppUser>(userManager, optionsAccessor)
{
    protected override async Task<ClaimsIdentity> GenerateClaimsAsync(AppUser user)
    {
        var identity = await base.GenerateClaimsAsync(user);

        identity.AddClaim(new Claim(AppClaimTypes.DisplayName, user.DisplayName));

        if (user.HouseholdId is { } householdId)
        {
            identity.AddClaim(new Claim(AppClaimTypes.HouseholdId, householdId.ToString()));
            identity.AddClaim(new Claim(AppClaimTypes.HouseholdRole, user.Role.ToString()));
        }

        return identity;
    }
}
