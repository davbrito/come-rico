using ComeRico.Core.Features.Products.Commands;
using ComeRico.Core.Features.Shopping.Queries;
using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Shopping.Commands;

/// <summary>
/// "Al carrito" / "sacar del carrito" while shopping. Doesn't touch the product or its history: the purchase
/// only happens at checkout, so a wrong check costs nothing.
/// </summary>
public sealed record SetShoppingItemInCartCommand(Guid Id, bool InCart) : IRequest<ShoppingItemDto?>;

public sealed class SetShoppingItemInCartCommandHandler(
    IAppDbContext dbContext,
    ICurrentUserService currentUser,
    TimeProvider clock
) : IRequestHandler<SetShoppingItemInCartCommand, ShoppingItemDto?>
{
    public async Task<ShoppingItemDto?> Handle(SetShoppingItemInCartCommand request, CancellationToken cancellationToken)
    {
        var item = await dbContext.ShoppingItems.FirstOrDefaultAsync(
            s => s.Id == request.Id && s.DismissedAt == null,
            cancellationToken
        );
        if (item is null || !item.IsOnList)
            return null;

        if (request.InCart)
            item.PutInCart(currentUser.UserId, clock.GetUtcNow().UtcDateTime);
        else
            item.TakeOutOfCart();

        await dbContext.SaveChangesAsync(cancellationToken);
        var ctx = await dbContext.GetHouseholdContextAsync(clock, cancellationToken);
        return await item.ToDtoAsync(dbContext, ctx, cancellationToken);
    }
}
