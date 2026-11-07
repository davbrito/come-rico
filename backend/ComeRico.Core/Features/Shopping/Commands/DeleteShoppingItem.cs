using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Commands;
using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Shopping.Commands;

/// <summary>
/// Removes an item so the next sync doesn't bring it back:
/// <list type="bullet">
/// <item>Menu item → dismissed ("ya tengo"), hidden but remembered for the menu window.</item>
/// <item>Pending item of a due product → "Saltar esta compra" (snooze).</item>
/// <item>Pending item of an out-of-stock product → "Sí hay" (and the snooze too if it's also due by time).</item>
/// <item>Anything else → deleted.</item>
/// </list>
/// </summary>
public sealed record DeleteShoppingItemCommand(Guid Id) : IRequest<bool>;

public sealed class DeleteShoppingItemCommandHandler(IAppDbContext dbContext, ICurrentUserService currentUser, TimeProvider clock)
    : IRequestHandler<DeleteShoppingItemCommand, bool>
{
    public async Task<bool> Handle(DeleteShoppingItemCommand request, CancellationToken cancellationToken)
    {
        var item = await dbContext.ShoppingItems.FirstOrDefaultAsync(
            s => s.Id == request.Id && s.DismissedAt == null,
            cancellationToken
        );
        if (item is null)
            return false;

        var now = clock.GetUtcNow().UtcDateTime;

        if (item.Source == ShoppingItemSource.MealPlan)
        {
            // Purchased ones too: they still count against the menu window until it rolls over.
            item.Dismiss(now);
            await dbContext.SaveChangesAsync(cancellationToken);
            return true;
        }

        if (item.IsOnList && item.ProductId is { } productId)
        {
            var product = await dbContext.FindActiveAsync(productId, cancellationToken);
            if (product is not null)
                await SkipThisShoppingAsync(product, now, cancellationToken);
        }

        dbContext.ShoppingItems.Remove(item);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task SkipThisShoppingAsync(Product product, DateTime now, CancellationToken ct)
    {
        var ctx = await dbContext.GetHouseholdContextAsync(clock, ct);

        if (product.OutOfStockAt is not null)
        {
            product.MarkInStock();
            dbContext.ProductEvents.Add(
                ProductMarkedInStock.Create(product.HouseholdId, product.Id, currentUser.UserId, EventOrigin.Web, now)
            );
        }

        if (RestockRule.Evaluate(product, ctx.Today, ctx.ShoppingDay) == RestockStatus.Due)
            dbContext.Snooze(product, ctx, ProductCommandSupport.SkipThisShoppingDays(ctx), currentUser.UserId, now);
    }
}
