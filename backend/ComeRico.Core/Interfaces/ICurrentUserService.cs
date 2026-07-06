using ComeRico.Core.Domain.Entities;

namespace ComeRico.Core.Interfaces;

/// <summary>
/// Resolves the authenticated user for the current request (from the auth cookie's claims).
/// </summary>
public interface ICurrentUserService
{
    Guid UserId { get; }
    bool IsAuthenticated { get; }
    HouseholdRole? Role { get; }
}
