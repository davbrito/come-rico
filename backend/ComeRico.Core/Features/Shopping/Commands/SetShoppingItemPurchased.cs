using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Commands;
using ComeRico.Core.Features.Shopping.Queries;
using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Shopping.Commands;

/// <summary>
/// Checks an item off (or back on). For an item linked to a product this is, until checkout lands (#60), the
/// real purchase: it logs <see cref="ProductPurchased"/> and updates the product (last purchase, clears
/// out-of-stock and snooze). Unchecking logs <see cref="ProductPurchaseReverted"/> and restores the product's
/// last purchase from the history.
/// </summary>
public sealed record SetShoppingItemPurchasedCommand(Guid Id, bool IsPurchased) : IRequest<ShoppingItemDto?>;

public sealed class SetShoppingItemPurchasedCommandHandler(
    IAppDbContext dbContext,
    ICurrentUserService currentUser,
    TimeProvider clock
) : IRequestHandler<SetShoppingItemPurchasedCommand, ShoppingItemDto?>
{
    public async Task<ShoppingItemDto?> Handle(SetShoppingItemPurchasedCommand request, CancellationToken cancellationToken)
    {
        var item = await dbContext.ShoppingItems.FirstOrDefaultAsync(
            s => s.Id == request.Id && s.DismissedAt == null,
            cancellationToken
        );
        if (item is null)
            return null;

        var ctx = await dbContext.GetHouseholdContextAsync(clock, cancellationToken);
        if (item.IsPurchased == request.IsPurchased)
            return await item.ToDtoAsync(dbContext, ctx, cancellationToken);

        var now = clock.GetUtcNow().UtcDateTime;
        var product = item.ProductId is { } productId
            ? await dbContext.Products.FirstOrDefaultAsync(p => p.Id == productId, cancellationToken)
            : null;

        if (request.IsPurchased)
        {
            item.MarkPurchased(now);
            if (product is not null)
                RecordPurchase(product, item, ctx, now);
        }
        else
        {
            item.MarkPending();
            if (product is not null)
                await RevertPurchaseAsync(product, item, ctx, now, cancellationToken);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return await item.ToDtoAsync(dbContext, ctx, cancellationToken);
    }

    private void RecordPurchase(Product product, ShoppingItem item, HouseholdContext ctx, DateTime now)
    {
        var quantity = item.Quantity ?? product.DefaultQuantity ?? 1;
        var unit = item.Unit ?? product.DefaultUnit ?? MeasurementUnit.Piece;
        product.ApplyPurchase(ctx.Today, quantity, unit);
        dbContext.ProductEvents.Add(
            ProductPurchased.Create(
                product.HouseholdId,
                product.Id,
                currentUser.UserId,
                EventOrigin.Web,
                now,
                now,
                quantity,
                unit,
                shoppingItemId: item.Id
            )
        );
    }

    private async Task RevertPurchaseAsync(
        Product product,
        ShoppingItem item,
        HouseholdContext ctx,
        DateTime now,
        CancellationToken ct
    )
    {
        var history = await dbContext.ProductEvents.Where(e => e.ProductId == product.Id).ToListAsync(ct);
        var reverted = history.OfType<ProductPurchaseReverted>().Select(r => r.PurchaseEventId).ToHashSet();
        var purchases = history.OfType<ProductPurchased>().Where(p => !reverted.Contains(p.Id)).ToList();

        var purchase = purchases.Where(p => p.ShoppingItemId == item.Id).MaxBy(p => p.OccurredAt);
        if (purchase is null)
            return;

        dbContext.ProductEvents.Add(
            ProductPurchaseReverted.Create(product.HouseholdId, product.Id, currentUser.UserId, EventOrigin.Web, now, purchase.Id)
        );

        // Latest purchase still in effect: a real one, or a declared date (which carries no quantity).
        var candidates = purchases
            .Where(p => p.Id != purchase.Id)
            .Select(p =>
                (
                    On: HouseholdTime.ToLocalDate(new DateTimeOffset(p.OccurredAt, TimeSpan.Zero), ctx.TimeZone),
                    At: p.RecordedAt,
                    Quantity: (decimal?)p.Quantity,
                    Unit: (MeasurementUnit?)p.Unit
                )
            )
            .Concat(
                history
                    .OfType<ProductLastPurchaseDeclared>()
                    .Select(d =>
                        (On: d.DeclaredOn, At: d.RecordedAt, Quantity: product.DefaultQuantity, Unit: product.DefaultUnit)
                    )
            );
        var latest = candidates.OrderByDescending(c => c.On).ThenByDescending(c => c.At).FirstOrDefault();
        product.RestoreLastPurchase(latest == default ? null : latest.On, latest.Quantity, latest.Unit);
    }
}
