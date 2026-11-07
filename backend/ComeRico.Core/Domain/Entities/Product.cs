namespace ComeRico.Core.Domain.Entities;

/// <summary>
/// Household catalog item that can show up on the shopping list, either
/// because its restock interval elapsed or because someone marked it out of stock.
/// </summary>
public class Product : IHasHousehold
{
    public Guid Id { get; private set; }
    public Guid HouseholdId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public ProductCategory Category { get; private set; }

    public decimal? DefaultQuantity { get; private set; }
    public MeasurementUnit? DefaultUnit { get; private set; }

    /// <summary>How long <see cref="DefaultQuantity"/> lasts; null = only appears when marked out of stock.</summary>
    public int? RestockIntervalDays { get; private set; }

    public string? PreferredBrand { get; private set; }

    public DateOnly? LastPurchasedOn { get; private set; }
    public decimal? LastPurchasedQuantity { get; private set; }
    public MeasurementUnit? LastPurchasedUnit { get; private set; }

    public DateTime? OutOfStockAt { get; private set; }
    public DateOnly? SnoozedUntil { get; private set; }
    public bool IsActive { get; private set; } = true;
    public DateTime CreatedAt { get; private set; }

    public Household Household { get; private set; } = null!;

    private Product() { }

    public static Product Create(
        Guid householdId,
        string name,
        ProductCategory category,
        decimal? defaultQuantity,
        MeasurementUnit? defaultUnit,
        int? restockIntervalDays,
        string? preferredBrand,
        DateTime now
    )
    {
        return new()
        {
            Id = Guid.CreateVersion7(now),
            CreatedAt = now,
            HouseholdId = householdId,
            Name = name,
            Category = category,
            DefaultQuantity = defaultQuantity,
            DefaultUnit = defaultUnit,
            RestockIntervalDays = restockIntervalDays,
            PreferredBrand = preferredBrand,
        };
    }

    public void Update(
        string name,
        ProductCategory category,
        decimal? defaultQuantity,
        MeasurementUnit? defaultUnit,
        int? restockIntervalDays,
        string? preferredBrand
    )
    {
        Name = name;
        Category = category;
        DefaultQuantity = defaultQuantity;
        DefaultUnit = defaultUnit;
        RestockIntervalDays = restockIntervalDays;
        PreferredBrand = preferredBrand;
    }

    public void Deactivate() => IsActive = false;

    /// <summary>Applies a purchase: updates the last-purchase cache and clears out-of-stock and snooze.</summary>
    public void ApplyPurchase(DateOnly on, decimal quantity, MeasurementUnit unit)
    {
        LastPurchasedOn = on;
        LastPurchasedQuantity = quantity;
        LastPurchasedUnit = unit;
        OutOfStockAt = null;
        SnoozedUntil = null;
    }

    /// <summary>
    /// The user declared (or corrected) when it was last bought. Only updates the cache that feeds the
    /// restock rule; it is not a real purchase, so out-of-stock and snooze are left alone.
    /// </summary>
    public void DeclareLastPurchase(DateOnly on, decimal quantity, MeasurementUnit unit)
    {
        LastPurchasedOn = on;
        LastPurchasedQuantity = quantity;
        LastPurchasedUnit = unit;
    }

    /// <summary>
    /// After a purchase is reverted: the cache goes back to the latest purchase still in effect
    /// (all null if there is none). Out-of-stock and snooze, cleared by the purchase, stay cleared.
    /// </summary>
    public void RestoreLastPurchase(DateOnly? on, decimal? quantity, MeasurementUnit? unit)
    {
        LastPurchasedOn = on;
        LastPurchasedQuantity = on is null ? null : quantity;
        LastPurchasedUnit = on is null ? null : unit;
    }

    public void MarkOutOfStock(DateTime now) => OutOfStockAt ??= now;

    public void MarkInStock() => OutOfStockAt = null;

    public void SnoozeUntil(DateOnly date) => SnoozedUntil = date;
}
