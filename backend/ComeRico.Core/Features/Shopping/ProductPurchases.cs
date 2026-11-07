using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Commands;
using ComeRico.Core.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Shopping;

/// <summary>How a confirmed purchase reaches a catalog product, and how it's undone.</summary>
internal static class ProductPurchases
{
    /// <summary>Logs <see cref="ProductPurchased"/> for the item and updates the product (last purchase; clears out-of-stock and snooze).</summary>
    public static void RecordPurchase(
        this IAppDbContext db,
        Product product,
        ShoppingItem item,
        HouseholdContext ctx,
        Guid userId,
        DateTime now,
        Guid tripId,
        string? store
    )
    {
        var quantity = item.Quantity ?? product.DefaultQuantity ?? 1;
        var unit = item.Unit ?? product.DefaultUnit ?? MeasurementUnit.Piece;
        product.ApplyPurchase(ctx.Today, quantity, unit);
        db.ProductEvents.Add(
            ProductPurchased.Create(
                product.HouseholdId,
                product.Id,
                userId,
                EventOrigin.Web,
                now,
                now,
                quantity,
                unit,
                shoppingItemId: item.Id,
                shoppingTripId: tripId,
                store: store
            )
        );
    }

    /// <summary>
    /// Logs <see cref="ProductPurchaseReverted"/> for the product's purchases in <paramref name="tripId"/> and
    /// restores its last-purchase cache from the latest purchase (or declared date) still in effect. If the
    /// latest out-of-stock / in-stock / purchase event left in effect is "se acabó", it comes back too.
    /// A snooze cleared by the purchase stays cleared (the reminder simply shows up again).
    /// </summary>
    public static async Task RevertTripPurchasesAsync(
        this IAppDbContext db,
        Product product,
        Guid tripId,
        HouseholdContext ctx,
        Guid userId,
        DateTime now,
        CancellationToken ct
    )
    {
        var history = await db.ProductEvents.Where(e => e.ProductId == product.Id).ToListAsync(ct);
        var reverted = history.OfType<ProductPurchaseReverted>().Select(r => r.PurchaseEventId).ToHashSet();
        var inEffect = history.OfType<ProductPurchased>().Where(p => !reverted.Contains(p.Id)).ToList();

        var undone = inEffect.Where(p => p.ShoppingTripId == tripId).ToList();
        if (undone.Count == 0)
            return;
        foreach (var purchase in undone)
        {
            db.ProductEvents.Add(
                ProductPurchaseReverted.Create(product.HouseholdId, product.Id, userId, EventOrigin.Web, now, purchase.Id)
            );
        }

        var latest = inEffect
            .Except(undone)
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
            )
            .OrderByDescending(c => c.On)
            .ThenByDescending(c => c.At)
            .FirstOrDefault();
        product.RestoreLastPurchase(latest == default ? null : latest.On, latest.Quantity, latest.Unit);

        var stock = history
            .Where(e =>
                e is ProductMarkedOutOfStock or ProductMarkedInStock
                || (e is ProductPurchased p && inEffect.Contains(p) && !undone.Contains(p))
            )
            .OrderByDescending(e => e.OccurredAt)
            .ThenByDescending(e => e.RecordedAt)
            .FirstOrDefault();
        product.RestoreOutOfStock(stock is ProductMarkedOutOfStock gone ? gone.OccurredAt : null);
    }
}
