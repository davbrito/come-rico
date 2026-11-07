using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Images;
using ComeRico.Core.Features.MealPlans.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.MealPlans.Commands;

/// <summary>"Vienen dos más": changes how many people a planned meal is cooked for.</summary>
public sealed record SetMealPlanServingsCommand(Guid Id, int Servings) : IRequest<MealPlanDto?>;

public sealed class SetMealPlanServingsCommandValidator : AbstractValidator<SetMealPlanServingsCommand>
{
    public SetMealPlanServingsCommandValidator()
    {
        RuleFor(x => x.Servings)
            .InclusiveBetween(Portions.Min, Portions.Max)
            .WithMessage($"Las porciones deben estar entre {Portions.Min} y {Portions.Max}.");
    }
}

public sealed class SetMealPlanServingsCommandHandler(IAppDbContext dbContext, IFileStorage storage)
    : IRequestHandler<SetMealPlanServingsCommand, MealPlanDto?>
{
    public async Task<MealPlanDto?> Handle(SetMealPlanServingsCommand request, CancellationToken cancellationToken)
    {
        var plan = await dbContext.MealPlans.Include(m => m.Dish).FirstOrDefaultAsync(m => m.Id == request.Id, cancellationToken);
        if (plan is null)
            return null;

        plan.SetServings(request.Servings);
        await dbContext.SaveChangesAsync(cancellationToken);
        return new MealPlanDto(
            plan.Id,
            plan.Date,
            plan.MealType,
            plan.Servings,
            plan.DishId,
            plan.Dish.Name,
            plan.Dish.Servings,
            storage.ResolveImageUrl(plan.Dish.ImageKey)
        );
    }
}
