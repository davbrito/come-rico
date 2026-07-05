using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Dishes.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Dishes.Commands;

public sealed record IngredientInput(string Name, decimal Amount, MeasurementUnit Unit);

public sealed record SetDishIngredientsCommand(Guid DishId, IReadOnlyList<IngredientInput> Ingredients) : IRequest<DishDto?>;

public sealed class SetDishIngredientsCommandValidator : AbstractValidator<SetDishIngredientsCommand>
{
    public SetDishIngredientsCommandValidator()
    {
        RuleFor(x => x.DishId).NotEmpty().WithMessage("El identificador del platillo es obligatorio.");
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

public sealed class SetDishIngredientsCommandHandler(IAppDbContext dbContext, ITenantService tenantService, IFileStorage storage)
    : IRequestHandler<SetDishIngredientsCommand, DishDto?>
{
    public async Task<DishDto?> Handle(SetDishIngredientsCommand request, CancellationToken cancellationToken)
    {
        var dish = await dbContext
            .Dishes.Include(d => d.Ingredients)
            .Include(d => d.Tags)
            .FirstOrDefaultAsync(d => d.Id == request.DishId, cancellationToken);
        if (dish is null)
            return null;

        // Add/Remove via the DbSet: client-generated Guid keys make EF treat
        // entities discovered through the navigation as Modified, not Added.
        // EF's relationship fixup keeps dish.Ingredients in sync.
        dbContext.Ingredients.RemoveRange(dish.Ingredients);
        foreach (var input in request.Ingredients)
        {
            dbContext.Ingredients.Add(
                Ingredient.Create(tenantService.HouseholdId, dish.Id, input.Name.Trim(), input.Amount, input.Unit)
            );
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return dish.ToDto(storage);
    }
}
