using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Images;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.MealPlans.Queries;

public sealed record GetMealPlansQuery(DateOnly From, DateOnly To) : IRequest<IReadOnlyList<MealPlanDto>>;

public sealed record MealPlanDto(Guid Id, DateOnly Date, MealType MealType, Guid DishId, string DishName, string? DishImageUrl);

public sealed class GetMealPlansQueryValidator : AbstractValidator<GetMealPlansQuery>
{
    public GetMealPlansQueryValidator()
    {
        RuleFor(x => x.To)
            .GreaterThanOrEqualTo(x => x.From)
            .WithMessage("La fecha final debe ser posterior o igual a la inicial.");
    }
}

public sealed class GetMealPlansQueryHandler(IAppDbContext dbContext, IFileStorage storage)
    : IRequestHandler<GetMealPlansQuery, IReadOnlyList<MealPlanDto>>
{
    public async Task<IReadOnlyList<MealPlanDto>> Handle(GetMealPlansQuery request, CancellationToken cancellationToken)
    {
        var plans = await dbContext
            .MealPlans.Where(m => m.Date >= request.From && m.Date <= request.To)
            .OrderBy(m => m.Date)
            .ThenBy(m => m.MealType)
            .Select(m => new
            {
                m.Id,
                m.Date,
                m.MealType,
                m.DishId,
                DishName = m.Dish.Name,
                m.Dish.ImageKey,
            })
            .ToListAsync(cancellationToken);

        return
        [
            .. plans.Select(m => new MealPlanDto(
                m.Id,
                m.Date,
                m.MealType,
                m.DishId,
                m.DishName,
                storage.ResolveImageUrl(m.ImageKey)
            )),
        ];
    }
}
