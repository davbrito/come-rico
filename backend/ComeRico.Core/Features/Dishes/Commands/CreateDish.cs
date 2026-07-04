using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Dishes.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;

namespace ComeRico.Core.Features.Dishes.Commands;

public sealed record CreateDishCommand(string Name, string? Description, string? ImageUrl) : IRequest<DishDto>;

public sealed class CreateDishCommandValidator : AbstractValidator<CreateDishCommand>
{
    public CreateDishCommandValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("El nombre del platillo es obligatorio.")
            .MaximumLength(200).WithMessage("El nombre no puede superar los 200 caracteres.");
        RuleFor(x => x.Description)
            .MaximumLength(1000).WithMessage("La descripción no puede superar los 1000 caracteres.")
            .When(x => x.Description is not null);
        RuleFor(x => x.ImageUrl)
            .MaximumLength(2048).WithMessage("La URL de imagen no puede superar los 2048 caracteres.")
            .When(x => x.ImageUrl is not null);
    }
}

public sealed class CreateDishCommandHandler(IAppDbContext dbContext, ITenantService tenantService)
    : IRequestHandler<CreateDishCommand, DishDto>
{
    public async Task<DishDto> Handle(CreateDishCommand request, CancellationToken cancellationToken)
    {
        var dish = Dish.Create(tenantService.HouseholdId, request.Name, request.Description, request.ImageUrl);
        dbContext.Dishes.Add(dish);
        await dbContext.SaveChangesAsync(cancellationToken);
        return new DishDto(dish.Id, dish.HouseholdId, dish.Name, dish.Description, dish.ImageUrl, dish.IsActive, dish.CreatedAt);
    }
}
