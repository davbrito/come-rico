using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Tags.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Dishes.Queries;

public sealed record GetDishesQuery : IRequest<IReadOnlyList<DishDto>>;

public sealed record IngredientDto(Guid Id, string Name, decimal Amount, MeasurementUnit Unit);

public sealed record DishDto(
    Guid Id,
    Guid HouseholdId,
    string Name,
    string? Description,
    string? ImageUrl,
    bool IsActive,
    DateTime CreatedAt,
    IReadOnlyList<IngredientDto> Ingredients,
    IReadOnlyList<TagDto> Tags
);

public static class DishDtoMapper
{
    public static DishDto ToDto(this Dish dish) =>
        new(
            dish.Id,
            dish.HouseholdId,
            dish.Name,
            dish.Description,
            dish.ImageUrl,
            dish.IsActive,
            dish.CreatedAt,
            [.. dish.Ingredients.OrderBy(i => i.Name).Select(i => new IngredientDto(i.Id, i.Name, i.Amount, i.Unit))],
            [.. dish.Tags.OrderBy(t => t.Name).Select(t => new TagDto(t.Id, t.Name))]
        );
}

public sealed class GetDishesQueryHandler(IAppDbContext dbContext) : IRequestHandler<GetDishesQuery, IReadOnlyList<DishDto>>
{
    public async Task<IReadOnlyList<DishDto>> Handle(GetDishesQuery request, CancellationToken cancellationToken)
    {
        var dishes = await dbContext
            .Dishes.Where(d => d.IsActive)
            .Include(d => d.Ingredients)
            .Include(d => d.Tags)
            .OrderBy(d => d.Name)
            .ToListAsync(cancellationToken);

        return [.. dishes.Select(d => d.ToDto())];
    }
}
