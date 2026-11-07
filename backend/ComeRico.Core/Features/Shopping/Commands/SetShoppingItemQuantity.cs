using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Commands;
using ComeRico.Core.Features.Shopping.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Shopping.Commands;

/// <summary>"Eché 2": adjusts how much is (or will be) bought. Not allowed once purchased.</summary>
public sealed record SetShoppingItemQuantityCommand(Guid Id, decimal? Quantity) : IRequest<ShoppingItemDto?>;

public sealed class SetShoppingItemQuantityCommandValidator : AbstractValidator<SetShoppingItemQuantityCommand>
{
    public SetShoppingItemQuantityCommandValidator()
    {
        RuleFor(x => x.Quantity)
            .GreaterThan(0)
            .WithMessage("La cantidad debe ser mayor que cero.")
            .When(x => x.Quantity is not null);
    }
}

public sealed class SetShoppingItemQuantityCommandHandler(IAppDbContext dbContext, TimeProvider clock)
    : IRequestHandler<SetShoppingItemQuantityCommand, ShoppingItemDto?>
{
    public async Task<ShoppingItemDto?> Handle(SetShoppingItemQuantityCommand request, CancellationToken cancellationToken)
    {
        var item = await dbContext.ShoppingItems.FirstOrDefaultAsync(
            s => s.Id == request.Id && s.DismissedAt == null && s.Status != ShoppingItemStatus.Purchased,
            cancellationToken
        );
        if (item is null)
            return null;

        item.SetQuantity(request.Quantity);
        await dbContext.SaveChangesAsync(cancellationToken);
        var ctx = await dbContext.GetHouseholdContextAsync(clock, cancellationToken);
        return await item.ToDtoAsync(dbContext, ctx, cancellationToken);
    }
}
