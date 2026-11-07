using ComeRico.Core.Features.Products.Commands;
using ComeRico.Core.Features.Shopping.Queries;
using ComeRico.Core.Interfaces;
using MediatR;

namespace ComeRico.Core.Features.Shopping.Commands;

/// <summary>
/// Brings the list up to date (spike 3.3): due and out-of-stock catalog products, plus the consolidated
/// ingredients of the menu window. Idempotent and never fails for an empty menu. Runs when the list opens
/// and with "Actualizar lista". Returns the whole list.
/// </summary>
public sealed record SyncShoppingListCommand : IRequest<IReadOnlyList<ShoppingItemDto>>;

public sealed class SyncShoppingListCommandHandler(IAppDbContext dbContext, TimeProvider clock)
    : IRequestHandler<SyncShoppingListCommand, IReadOnlyList<ShoppingItemDto>>
{
    public async Task<IReadOnlyList<ShoppingItemDto>> Handle(SyncShoppingListCommand request, CancellationToken cancellationToken)
    {
        var ctx = await dbContext.GetHouseholdContextAsync(clock, cancellationToken);
        await dbContext.SyncAllAsync(ctx, clock.GetUtcNow().UtcDateTime, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return await dbContext.GetShoppingListAsync(ctx, cancellationToken);
    }
}
