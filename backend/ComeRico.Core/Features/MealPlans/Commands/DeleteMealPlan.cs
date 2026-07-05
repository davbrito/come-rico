using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.MealPlans.Commands;

public sealed record DeleteMealPlanCommand(Guid Id) : IRequest<bool>;

public sealed class DeleteMealPlanCommandHandler(IAppDbContext dbContext) : IRequestHandler<DeleteMealPlanCommand, bool>
{
    public async Task<bool> Handle(DeleteMealPlanCommand request, CancellationToken cancellationToken)
    {
        var mealPlan = await dbContext.MealPlans.FirstOrDefaultAsync(m => m.Id == request.Id, cancellationToken);
        if (mealPlan is null)
            return false;

        dbContext.MealPlans.Remove(mealPlan);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }
}
