using ComeRico.Core.Features.Shopping.Queries;
using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Shopping.Commands;

public sealed record SetShoppingItemPurchasedCommand(Guid Id, bool IsPurchased) : IRequest<ShoppingItemDto?>;

public sealed class SetShoppingItemPurchasedCommandHandler(IAppDbContext dbContext)
    : IRequestHandler<SetShoppingItemPurchasedCommand, ShoppingItemDto?>
{
    public async Task<ShoppingItemDto?> Handle(SetShoppingItemPurchasedCommand request, CancellationToken cancellationToken)
    {
        var item = await dbContext.ShoppingItems.FirstOrDefaultAsync(s => s.Id == request.Id, cancellationToken);
        if (item is null)
            return null;

        item.SetPurchased(request.IsPurchased);
        await dbContext.SaveChangesAsync(cancellationToken);
        return item.ToDto();
    }
}
