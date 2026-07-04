using ComeRico.Core.Interfaces;

namespace ComeRico.Api.Services;

/// <summary>
/// Resolves the current household tenant from the HTTP request context.
/// The household ID is expected to be provided in the X-Household-Id header.
/// In production, this should be resolved from a validated JWT claim.
/// </summary>
public sealed class HttpTenantService(IHttpContextAccessor httpContextAccessor) : ITenantService
{
    private Guid? _householdId;

    public Guid HouseholdId
    {
        get
        {
            if (_householdId.HasValue) return _householdId.Value;

            var context = httpContextAccessor.HttpContext;
            if (context is null)
                throw new InvalidOperationException("No HTTP context available to resolve tenant.");

            var headerValue = context.Request.Headers["X-Household-Id"].FirstOrDefault();
            if (!Guid.TryParse(headerValue, out var parsed))
                throw new InvalidOperationException("Missing or invalid X-Household-Id header.");

            _householdId = parsed;
            return _householdId.Value;
        }
    }

    public bool IsResolved
    {
        get
        {
            var context = httpContextAccessor.HttpContext;
            if (context is null) return false;
            var headerValue = context.Request.Headers["X-Household-Id"].FirstOrDefault();
            return Guid.TryParse(headerValue, out _);
        }
    }
}
