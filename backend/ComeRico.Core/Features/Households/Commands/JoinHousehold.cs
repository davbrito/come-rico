using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Households.Commands;

public sealed record JoinHouseholdCommand(string InviteCode) : IRequest<HouseholdDto>;

public sealed class JoinHouseholdCommandValidator : AbstractValidator<JoinHouseholdCommand>
{
    public JoinHouseholdCommandValidator()
    {
        RuleFor(x => x.InviteCode)
            .NotEmpty()
            .WithMessage("El código de invitación es obligatorio.")
            .MaximumLength(20)
            .WithMessage("El código de invitación no es válido.");
    }
}

public sealed class JoinHouseholdCommandHandler(IAppDbContext dbContext, ICurrentUserService currentUser)
    : IRequestHandler<JoinHouseholdCommand, HouseholdDto>
{
    public async Task<HouseholdDto> Handle(JoinHouseholdCommand request, CancellationToken cancellationToken)
    {
        var user =
            await dbContext.Users.FirstOrDefaultAsync(u => u.Id == currentUser.UserId, cancellationToken)
            ?? throw new InvalidOperationException("Usuario no encontrado.");

        if (user.HouseholdId is not null)
            throw new InvalidOperationException("Ya perteneces a un hogar. Sal de él antes de unirte a otro.");

        var code = request.InviteCode.Trim().ToUpperInvariant();
        var household =
            await dbContext.Households.FirstOrDefaultAsync(h => h.InviteCode == code, cancellationToken)
            ?? throw new InvalidOperationException("No existe un hogar con ese código de invitación.");

        user.JoinHousehold(household.Id, HouseholdRole.Member);

        await dbContext.SaveChangesAsync(cancellationToken);
        return new HouseholdDto(household.Id, household.Name, household.InviteCode, household.CreatedAt);
    }
}
