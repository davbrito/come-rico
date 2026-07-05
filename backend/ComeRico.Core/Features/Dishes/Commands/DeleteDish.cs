using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Dishes.Commands;

public sealed record DeleteDishCommand(Guid DishId) : IRequest<bool>;

public sealed class DeleteDishCommandValidator : AbstractValidator<DeleteDishCommand>
{
    public DeleteDishCommandValidator()
    {
        RuleFor(x => x.DishId).NotEmpty().WithMessage("El identificador del platillo es obligatorio.");
    }
}

public sealed class DeleteDishCommandHandler(IAppDbContext dbContext) : IRequestHandler<DeleteDishCommand, bool>
{
    public async Task<bool> Handle(DeleteDishCommand request, CancellationToken cancellationToken)
    {
        var dish = await dbContext.Dishes.FirstOrDefaultAsync(d => d.Id == request.DishId, cancellationToken);
        if (dish is null)
            return false;
        dish.Deactivate();
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }
}
