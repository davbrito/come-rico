using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Images;
using ComeRico.Core.Features.MealPlans.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.MealPlans.Commands;

public sealed record CreateMealPlanCommand(Guid DishId, DateOnly Date, MealType MealType) : IRequest<MealPlanDto>;

public sealed class CreateMealPlanCommandValidator : AbstractValidator<CreateMealPlanCommand>
{
    public CreateMealPlanCommandValidator()
    {
        RuleFor(x => x.DishId).NotEmpty().WithMessage("El platillo es obligatorio.");
        RuleFor(x => x.MealType).IsInEnum().WithMessage("El tipo de comida no es válido.");
    }
}

public sealed class CreateMealPlanCommandHandler(IAppDbContext dbContext, ITenantService tenantService, IFileStorage storage)
    : IRequestHandler<CreateMealPlanCommand, MealPlanDto>
{
    public async Task<MealPlanDto> Handle(CreateMealPlanCommand request, CancellationToken cancellationToken)
    {
        var dish =
            await dbContext.Dishes.FirstOrDefaultAsync(d => d.Id == request.DishId && d.IsActive, cancellationToken)
            ?? throw new InvalidOperationException("El platillo no existe o está inactivo.");

        var alreadyPlanned = await dbContext.MealPlans.AnyAsync(
            m => m.Date == request.Date && m.MealType == request.MealType && m.DishId == request.DishId,
            cancellationToken
        );
        if (alreadyPlanned)
            throw new InvalidOperationException("Ese platillo ya está planificado para esa comida.");

        var mealPlan = MealPlan.Create(tenantService.HouseholdId, dish.Id, request.Date, request.MealType);
        dbContext.MealPlans.Add(mealPlan);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new MealPlanDto(
            mealPlan.Id,
            mealPlan.Date,
            mealPlan.MealType,
            dish.Id,
            dish.Name,
            storage.ResolveImageUrl(dish.ImageKey)
        );
    }
}
