using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Commands;
using ComeRico.Core.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Shopping;

/// <summary>
/// Keeps the shopping list (a synced table, spike 3.3) in line with the catalog and the menu.
/// Every method is idempotent: running it twice leaves the list as running it once.
/// </summary>
internal static class ShoppingListSync
{
    /// <summary>The menu window: which meals the next trip buys for, and since when earlier menu buys count.</summary>
    /// <param name="From">First meal date covered.</param>
    /// <param name="To">Last meal date covered (inclusive).</param>
    /// <param name="CountSince">Menu items purchased or dismissed on/after this local date still cover this window.</param>
    public sealed record MenuWindow(DateOnly From, DateOnly To, DateOnly CountSince);

    /// <summary>
    /// With a shopping day: the 7 days starting at the next trip (today included), so the trip buys for the
    /// meals until the following one. Without: today + 6. Menu items bought or dismissed in the 6 days before
    /// the window starts are assumed to be for it (they were bought after the previous trip).
    /// </summary>
    public static MenuWindow GetMenuWindow(DateOnly today, DayOfWeek? shoppingDay)
    {
        var anchor = shoppingDay is { } day ? RestockRule.NextShoppingDay(today, day) : today;
        return new(anchor, anchor.AddDays(6), anchor.AddDays(-6));
    }

    /// <summary>Whether the restock rule puts the product on the list right now.</summary>
    public static bool BelongsOnList(Product product, HouseholdContext ctx) =>
        product.IsActive
        && RestockRule.Evaluate(product, ctx.Today, ctx.ShoppingDay) is RestockStatus.Due or RestockStatus.OutOfStock;

    /// <summary>
    /// Adds the product's item if it's due/out of stock and has no pending item; removes its pending
    /// <see cref="ShoppingItemSource.Recurring"/> item if it no longer belongs (snoozed, "sí hay", deactivated).
    /// A manual item linked to the product is left alone: someone added it on purpose. Call before
    /// <c>SaveChanges</c>; the caller saves.
    /// </summary>
    public static async Task SyncProductOnListAsync(
        this IAppDbContext db,
        Product product,
        HouseholdContext ctx,
        DateTime now,
        CancellationToken ct
    )
    {
        var pending = await db
            .ShoppingItems.Where(s => s.ProductId == product.Id && !s.IsPurchased && s.DismissedAt == null)
            .ToListAsync(ct);
        Reconcile(db, product, BelongsOnList(product, ctx), pending, now);
    }

    private static void Reconcile(IAppDbContext db, Product product, bool belongs, List<ShoppingItem> pending, DateTime now)
    {
        if (belongs)
        {
            if (pending.Count == 0)
                db.ShoppingItems.Add(ShoppingItem.CreateRecurring(product, now));
            return;
        }

        foreach (var item in pending.Where(i => i.Source == ShoppingItemSource.Recurring))
            db.ShoppingItems.Remove(item);
    }

    /// <summary>Full sync: every catalog product plus the menu window. Does not save.</summary>
    public static async Task SyncAllAsync(this IAppDbContext db, HouseholdContext ctx, DateTime now, CancellationToken ct)
    {
        await SyncProductsAsync(db, ctx, now, ct);
        await SyncMenuAsync(db, ctx, now, ct);
    }

    private static async Task SyncProductsAsync(IAppDbContext db, HouseholdContext ctx, DateTime now, CancellationToken ct)
    {
        var products = await db.Products.ToListAsync(ct);
        var pendingByProduct = (
            await db.ShoppingItems.Where(s => s.ProductId != null && !s.IsPurchased && s.DismissedAt == null).ToListAsync(ct)
        ).ToLookup(s => s.ProductId!.Value);

        foreach (var product in products)
            Reconcile(db, product, BelongsOnList(product, ctx), [.. pendingByProduct[product.Id]], now);
    }

    private static (string Name, MeasurementUnit Unit) Key(string name, MeasurementUnit unit) =>
        (name.Trim().ToLowerInvariant(), unit);

    /// <summary>
    /// Consolidates the ingredients of the meals in the window (summed by name + unit) and reconciles the
    /// pending menu items with them: updates quantities in place (stable ids for the UI), adds what's missing
    /// and removes what's no longer needed. Purchased menu items in the look-back subtract from what's needed;
    /// a dismissed one ("ya tengo") drops its ingredient for the window. Purchased items are never touched.
    /// </summary>
    private static async Task SyncMenuAsync(IAppDbContext db, HouseholdContext ctx, DateTime now, CancellationToken ct)
    {
        var window = GetMenuWindow(ctx.Today, ctx.ShoppingDay);
        var countSinceUtc = HouseholdTime.StartOfDayUtc(window.CountSince, ctx.TimeZone);

        var planned = await db
            .MealPlans.Where(m => m.Date >= window.From && m.Date <= window.To)
            .SelectMany(
                m => m.Dish.Ingredients,
                (m, i) =>
                    new
                    {
                        i.Name,
                        i.Quantity,
                        i.Unit,
                        Planned = m.Servings,
                        Yields = m.Dish.Servings,
                    }
            )
            .ToListAsync(ct);

        var menuItems = await db.ShoppingItems.Where(s => s.Source == ShoppingItemSource.MealPlan).ToListAsync(ct);

        var dismissed = menuItems
            .Where(s => s.DismissedAt >= countSinceUtc && s.Unit is not null)
            .Select(s => Key(s.Name, s.Unit!.Value))
            .ToHashSet();
        var purchased = menuItems
            .Where(s => s.IsPurchased && s.DismissedAt is null && s.PurchasedAt >= countSinceUtc && s.Unit is not null)
            .GroupBy(s => Key(s.Name, s.Unit!.Value))
            .ToDictionary(g => g.Key, g => g.Sum(s => s.Quantity ?? 0));
        // Menu items always carry a unit (ingredients do); one without it can't match anything.
        db.ShoppingItems.RemoveRange(menuItems.Where(s => s.IsPending && s.Unit is null));
        var pending = menuItems
            .Where(s => s.IsPending && s.Unit is not null)
            .GroupBy(s => Key(s.Name, s.Unit!.Value))
            .ToDictionary(g => g.Key, g => g.ToList());

        var needed = planned
            .GroupBy(i => Key(i.Name, i.Unit))
            .Where(g => !dismissed.Contains(g.Key))
            .Select(g =>
                (
                    g.Key,
                    // Keep the casing of the first occurrence for display
                    Name: g.First().Name.Trim(),
                    g.Key.Unit,
                    // Scaled to the people each meal is cooked for (spike 3.5), then rounded for buying.
                    Quantity: Portions.RoundForList(
                        g.Sum(i => Portions.Scale(i.Quantity, i.Planned, i.Yields)) - purchased.GetValueOrDefault(g.Key),
                        g.Key.Unit
                    )
                )
            )
            .Where(n => n.Quantity > 0);

        foreach (var need in needed)
        {
            if (pending.Remove(need.Key, out var existing))
            {
                existing[0].SetQuantity(need.Quantity);
                db.ShoppingItems.RemoveRange(existing.Skip(1));
            }
            else
            {
                db.ShoppingItems.Add(ShoppingItem.CreateFromMealPlan(ctx.HouseholdId, need.Name, need.Quantity, need.Unit, now));
            }
        }

        // Pending menu items nothing in the window asks for anymore.
        foreach (var leftover in pending.Values)
            db.ShoppingItems.RemoveRange(leftover);
    }
}
