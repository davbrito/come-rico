namespace ComeRico.Core.Domain.Entities;

public enum RestockStatus
{
    /// <summary>Nothing to do yet.</summary>
    Ok,

    /// <summary>Will be due within the next 7 days.</summary>
    DueSoon,

    /// <summary>Should be on the shopping list because its interval elapsed.</summary>
    Due,

    /// <summary>Marked out of stock; always on the list.</summary>
    OutOfStock,
}

/// <summary>The "when does a product show up on the list" rule (spike 3.1).</summary>
public static class RestockRule
{
    public const int DueSoonWindowDays = 7;

    /// <summary>Shortest allowed restock interval, also the floor of the quantity-scaled one.</summary>
    public const int MinIntervalDays = 2;

    public static RestockStatus Evaluate(Product product, DateOnly today, DayOfWeek? shoppingDay)
    {
        if (product.OutOfStockAt is not null)
            return RestockStatus.OutOfStock;

        if (product.RestockIntervalDays is null)
            return RestockStatus.Ok;

        var reference = shoppingDay is { } day ? NextShoppingDay(today, day) : today;
        var effective = NextDueOn(product);

        // A product never bought counts as overdue (unless snoozed).
        if (reference >= (effective ?? DateOnly.MinValue))
            return RestockStatus.Due;

        if (effective is { } next && today.AddDays(DueSoonWindowDays) >= next)
            return RestockStatus.DueSoon;

        return RestockStatus.Ok;
    }

    /// <summary>When the product will next be due: <c>max(DueOn, SnoozedUntil)</c>; null if neither applies.</summary>
    public static DateOnly? NextDueOn(Product product)
    {
        if (product.RestockIntervalDays is null)
            return null;

        var dueOn = DueOn(product);
        return (dueOn, product.SnoozedUntil) switch
        {
            ({ } due, { } snoozed) => due > snoozed ? due : snoozed,
            ({ } due, null) => due,
            (null, { } snoozed) => snoozed,
            _ => null,
        };
    }

    /// <summary>LastPurchasedOn + effective interval; null if there is no interval or no purchase yet.</summary>
    public static DateOnly? DueOn(Product product)
    {
        if (product.RestockIntervalDays is not { } t || product.LastPurchasedOn is not { } last)
            return null;

        return last.AddDays(EffectiveIntervalDays(product, t));
    }

    /// <summary>The interval scales with the quantity bought when it is in the default unit (no unit conversion).</summary>
    public static int EffectiveIntervalDays(Product product, int intervalDays)
    {
        if (
            product.LastPurchasedUnit is { } unit
            && unit == product.DefaultUnit
            && product.LastPurchasedQuantity is { } bought
            && product.DefaultQuantity is { } baseline
            && baseline > 0
        )
        {
            var scaled = (int)Math.Round(intervalDays * bought / baseline, MidpointRounding.AwayFromZero);
            return Math.Max(scaled, MinIntervalDays);
        }

        return intervalDays;
    }

    /// <summary>Next occurrence of <paramref name="day"/>, today included.</summary>
    public static DateOnly NextShoppingDay(DateOnly today, DayOfWeek day) =>
        today.AddDays(((int)day - (int)today.DayOfWeek + 7) % 7);
}
