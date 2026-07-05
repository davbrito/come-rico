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

public sealed class GetMealPlanByIdQueryHandler(IAppDbContext dbContext) : IRequestHandler<GetMealPlanByIdQuery, MealPlanDto?>
{
    public async Task<MealPlanDto?> Handle(GetMealPlanByIdQuery request, CancellationToken cancellationToken)
    {
        return await dbContext
            .MealPlans.Where(m => m.Id == request.Id)
            .Select(m => new MealPlanDto(m.Id, m.Date, m.MealType, m.DishId, m.Dish.Name, m.Dish.ImageUrl))
            .FirstOrDefaultAsync(cancellationToken);
    }
}
