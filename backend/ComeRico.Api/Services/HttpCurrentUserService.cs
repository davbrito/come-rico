using System.Security.Claims;
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

    public bool IsAuthenticated =>
        httpContextAccessor.HttpContext?.User.Identity?.IsAuthenticated ?? false;
}
