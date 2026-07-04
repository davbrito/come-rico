using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;

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

public sealed class CreateHouseholdCommandHandler(IAppDbContext dbContext)
    : IRequestHandler<CreateHouseholdCommand, HouseholdDto>
{
    public async Task<HouseholdDto> Handle(CreateHouseholdCommand request, CancellationToken cancellationToken)
    {
        var household = Household.Create(request.Name);
        dbContext.Households.Add(household);
        await dbContext.SaveChangesAsync(cancellationToken);
        return new HouseholdDto(household.Id, household.Name, household.InviteCode, household.CreatedAt);
    }
}
