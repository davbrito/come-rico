using System.Security.Claims;
using ComeRico.Api.Auth;
using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;

namespace ComeRico.Api.Services;

/// <summary>
/// Resolves the authenticated user's id from the auth cookie's NameIdentifier claim.
/// </summary>
public sealed class HttpCurrentUserService(IHttpContextAccessor httpContextAccessor) : ICurrentUserService
{
    public Guid UserId
    {
        get
        {
            var claim = httpContextAccessor.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!Guid.TryParse(claim, out var parsed))
                throw new InvalidOperationException("No hay un usuario autenticado.");
            return parsed;
        }
    }

    public bool IsAuthenticated => httpContextAccessor.HttpContext?.User.Identity?.IsAuthenticated ?? false;

    public HouseholdRole? Role
    {
        get
        {
            var claim = httpContextAccessor.HttpContext?.User.FindFirst(AppClaimTypes.HouseholdRole)?.Value;
            return Enum.TryParse<HouseholdRole>(claim, out var role) ? role : null;
        }
    }
}
