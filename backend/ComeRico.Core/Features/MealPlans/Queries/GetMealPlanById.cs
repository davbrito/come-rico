using ComeRico.Core.Features.Images;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.MealPlans.Queries;

public sealed record GetMealPlanByIdQuery(Guid Id) : IRequest<MealPlanDto?>;

public sealed class GetMealPlanByIdValidator : AbstractValidator<GetMealPlanByIdQuery>
{
    public GetMealPlanByIdValidator()
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("El identificador del plan de comidas es obligatorio.");
    }
}

public sealed class GetMealPlanByIdQueryHandler(IAppDbContext dbContext, IFileStorage storage)
    : IRequestHandler<GetMealPlanByIdQuery, MealPlanDto?>
{
    public async Task<MealPlanDto?> Handle(GetMealPlanByIdQuery request, CancellationToken cancellationToken)
    {
        var plan = await dbContext
            .MealPlans.Where(m => m.Id == request.Id)
            .Select(m => new
            {
                m.Id,
                m.Date,
                m.MealType,
                m.DishId,
                DishName = m.Dish.Name,
                m.Dish.ImageKey,
            })
            .FirstOrDefaultAsync(cancellationToken);

        return plan is null
            ? null
            : new MealPlanDto(
                plan.Id,
                plan.Date,
                plan.MealType,
                plan.DishId,
                plan.DishName,
                storage.ResolveImageUrl(plan.ImageKey)
            );
    }
}
