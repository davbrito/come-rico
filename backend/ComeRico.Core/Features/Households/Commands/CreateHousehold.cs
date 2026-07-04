using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Households.Commands;

public sealed record CreateHouseholdCommand(string Name) : IRequest<HouseholdDto>;

public sealed record HouseholdDto(Guid Id, string Name, string InviteCode, DateTime CreatedAt);

public sealed class CreateHouseholdCommandValidator : AbstractValidator<CreateHouseholdCommand>
{
    public CreateHouseholdCommandValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("El nombre del hogar es obligatorio.")
            .MaximumLength(200).WithMessage("El nombre no puede superar los 200 caracteres.");
    }
}

public sealed class CreateHouseholdCommandHandler(IAppDbContext dbContext, ICurrentUserService currentUser)
    : IRequestHandler<CreateHouseholdCommand, HouseholdDto>
{
    public async Task<HouseholdDto> Handle(CreateHouseholdCommand request, CancellationToken cancellationToken)
    {
        var user = await dbContext.Users
            .FirstOrDefaultAsync(u => u.Id == currentUser.UserId, cancellationToken)
            ?? throw new InvalidOperationException("Usuario no encontrado.");

        if (user.HouseholdId is not null)
            throw new InvalidOperationException("Ya perteneces a un hogar. Sal de él antes de crear uno nuevo.");

        var household = Household.Create(request.Name);
        dbContext.Households.Add(household);

        user.JoinHousehold(household.Id, HouseholdRole.Admin);

        await dbContext.SaveChangesAsync(cancellationToken);
        return new HouseholdDto(household.Id, household.Name, household.InviteCode, household.CreatedAt);
    }
}
