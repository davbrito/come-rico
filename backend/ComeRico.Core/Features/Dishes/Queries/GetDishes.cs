using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Dishes.Queries;

public sealed record GetDishesQuery : IRequest<IReadOnlyList<DishDto>>;

public sealed record DishDto(Guid Id, Guid HouseholdId, string Name, string? Description, string? ImageUrl, bool IsActive, DateTime CreatedAt);

public sealed class GetDishesQueryHandler(IAppDbContext dbContext)
    : IRequestHandler<GetDishesQuery, IReadOnlyList<DishDto>>
{
    public async Task<IReadOnlyList<DishDto>> Handle(GetDishesQuery request, CancellationToken cancellationToken)
    {
        return await dbContext.Dishes
            .Where(d => d.IsActive)
            .OrderBy(d => d.Name)
            .Select(d => new DishDto(d.Id, d.HouseholdId, d.Name, d.Description, d.ImageUrl, d.IsActive, d.CreatedAt))
            .ToListAsync(cancellationToken);
    }
}
