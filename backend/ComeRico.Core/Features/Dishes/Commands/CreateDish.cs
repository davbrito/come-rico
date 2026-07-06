using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Dishes.Queries;
using ComeRico.Core.Features.Images;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;

namespace ComeRico.Core.Features.Dishes.Commands;

public sealed record CreateDishCommand(
    string Name,
    string? Description,
    Guid? ImageUploadId,
    IReadOnlyList<IngredientInput>? Ingredients = null
) : IRequest<DishDto>;

public sealed class CreateDishCommandValidator : AbstractValidator<CreateDishCommand>
{
    public CreateDishCommandValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty()
            .WithMessage("El nombre del platillo es obligatorio.")
            .MaximumLength(200)
            .WithMessage("El nombre no puede superar los 200 caracteres.");
        RuleFor(x => x.Description)
            .MaximumLength(1000)
            .WithMessage("La descripción no puede superar los 1000 caracteres.")
            .When(x => x.Description is not null);
        RuleForEach(x => x.Ingredients)
            .ChildRules(ingredient =>
            {
                ingredient
                    .RuleFor(i => i.Name)
                    .NotEmpty()
                    .WithMessage("El nombre del ingrediente es obligatorio.")
                    .MaximumLength(200)
                    .WithMessage("El nombre del ingrediente no puede superar los 200 caracteres.");
                ingredient.RuleFor(i => i.Amount).GreaterThan(0).WithMessage("La cantidad debe ser mayor que cero.");
                ingredient.RuleFor(i => i.Unit).IsInEnum().WithMessage("La unidad de medida no es válida.");
            });
    }
}

public sealed class CreateDishCommandHandler(IAppDbContext dbContext, ITenantService tenantService, IFileStorage storage)
    : IRequestHandler<CreateDishCommand, DishDto>
{
    public async Task<DishDto> Handle(CreateDishCommand request, CancellationToken cancellationToken)
    {
        var imageKey = await dbContext.ResolveUploadAsync(storage, request.ImageUploadId, cancellationToken);
        var dish = Dish.Create(tenantService.HouseholdId, request.Name, request.Description, imageKey);
        dbContext.Dishes.Add(dish);

        foreach (var input in request.Ingredients ?? [])
        {
            dbContext.Ingredients.Add(
                Ingredient.Create(tenantService.HouseholdId, dish.Id, input.Name.Trim(), input.Amount, input.Unit)
            );
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return dish.ToDto(storage);
    }
}
