using ComeRico.Core.Interfaces;
using MediatR;

namespace ComeRico.Core.Features.Households.Commands;

public sealed record RotateInviteCodeCommand : IRequest<HouseholdDto>, IRequireHouseholdAdmin;

public sealed class RotateInviteCodeCommandHandler(IAppDbContext dbContext, ITenantService tenant)
    : IRequestHandler<RotateInviteCodeCommand, HouseholdDto>
{
    public async Task<HouseholdDto> Handle(RotateInviteCodeCommand request, CancellationToken cancellationToken)
    {
        var household =
            await dbContext.Households.FindAsync([tenant.HouseholdId], cancellationToken: cancellationToken)
            ?? throw new InvalidOperationException("Hogar no encontrado.");

        household.RotateInviteCode();

        await dbContext.SaveChangesAsync(cancellationToken);

        return new HouseholdDto(household.Id, household.Name, household.InviteCode, household.CreatedAt);
    }
}
