using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using MediatR;

namespace ComeRico.Core.Behaviors;

/// <summary>
/// MediatR pipeline behavior that enforces household-admin-only access for requests
/// implementing <see cref="IRequireHouseholdAdmin"/>.
/// The role is read from the auth cookie claims (stamped by <see cref="Auth.AppUserClaimsPrincipalFactory"/>),
/// so no database round-trip is needed.
/// </summary>
public sealed class AdminOnlyBehavior<TRequest, TResponse>(ICurrentUserService currentUser)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>, IRequireHouseholdAdmin
{
    public Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        if (currentUser.Role != HouseholdRole.Admin)
            throw new InvalidOperationException("Solo los administradores pueden realizar esta acción.");

        return next(cancellationToken);
    }
}
