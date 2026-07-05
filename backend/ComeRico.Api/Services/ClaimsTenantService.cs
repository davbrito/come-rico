using ComeRico.Api.Auth;
using ComeRico.Core.Interfaces;

namespace ComeRico.Api.Services;

/// <summary>
/// Resolves the current household tenant from the authenticated user's claims
/// (set by <see cref="Auth.AppUserClaimsPrincipalFactory"/> in the auth cookie).
/// EF Core global query filters depend on this service, so tenant isolation is
/// enforced by the validated cookie — never by client-supplied headers.
/// </summary>
public sealed class ClaimsTenantService(IHttpContextAccessor httpContextAccessor) : ITenantService
{
    private Guid? _householdId;

    public Guid HouseholdId =>
        _householdId ??= TryResolve() ?? throw new InvalidOperationException("El usuario no pertenece a ningún hogar.");

    public bool IsResolved => (_householdId ??= TryResolve()).HasValue;

    private Guid? TryResolve()
    {
        var claim = httpContextAccessor.HttpContext?.User.FindFirst(AppClaimTypes.HouseholdId)?.Value;
        return Guid.TryParse(claim, out var parsed) ? parsed : null;
    }
}
