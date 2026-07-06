using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Households.Commands;

public sealed record LeaveHouseholdCommand : IRequest;

public sealed class LeaveHouseholdCommandHandler(
    IAppDbContext dbContext,
    ICurrentUserService currentUser,
    IHouseholdMembershipService membershipService
) : IRequestHandler<LeaveHouseholdCommand>
{
    public async Task Handle(LeaveHouseholdCommand request, CancellationToken cancellationToken)
    {
        var user =
            await dbContext.Users.FirstOrDefaultAsync(u => u.Id == currentUser.UserId, cancellationToken)
            ?? throw new InvalidOperationException("Usuario no encontrado.");

        await membershipService.PromoteFallbackAdminIfNeededAsync(user, cancellationToken);

        user.LeaveHousehold();

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
