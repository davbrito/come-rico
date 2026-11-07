namespace ComeRico.Core.Domain.Entities;

/// <summary>Why an item is on the list.</summary>
public enum ShoppingItemSource
{
    /// <summary>Added by hand.</summary>
    Manual,

    /// <summary>Consolidated from the ingredients of the planned meals (replaced on every sync while pending).</summary>
    MealPlan,

    /// <summary>A catalog <see cref="Product"/> that is due or out of stock.</summary>
    Recurring,
}

public class ShoppingItem : IHasHousehold
{
    public Guid Id { get; private set; }
    public Guid HouseholdId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public decimal? Quantity { get; private set; }
    public MeasurementUnit? Unit { get; private set; }
    public ShoppingItemSource Source { get; private set; }

    /// <summary>The catalog product it came from (or was linked to with "hacer recurrente").</summary>
    public Guid? ProductId { get; private set; }

    public bool IsPurchased { get; private set; }
    public DateTime? PurchasedAt { get; private set; }

    /// <summary>
    /// A menu item the user removed ("ya tengo"). It is hidden instead of deleted so the next sync
    /// doesn't add it back; it only counts while it is within the sync's look-back window.
    /// </summary>
    public DateTime? DismissedAt { get; private set; }

    public DateTime CreatedAt { get; private set; }

    public Household Household { get; private set; } = null!;

    /// <summary>Still to buy: not purchased and not dismissed.</summary>
    public bool IsPending => !IsPurchased && DismissedAt is null;

    private ShoppingItem() { }

    private static ShoppingItem New(
        Guid householdId,
        string name,
        decimal? quantity,
        MeasurementUnit? unit,
        ShoppingItemSource source,
        Guid? productId,
        DateTime now
    ) =>
        new()
        {
            Id = Guid.CreateVersion7(now),
            CreatedAt = now,
            HouseholdId = householdId,
            Name = name,
            Quantity = quantity,
            Unit = unit,
            Source = source,
            ProductId = productId,
        };

    public static ShoppingItem CreateManual(
        Guid householdId,
        string name,
        decimal? quantity,
        MeasurementUnit? unit,
        DateTime now
    ) => New(householdId, name, quantity, unit, ShoppingItemSource.Manual, null, now);

    public static ShoppingItem CreateFromMealPlan(
        Guid householdId,
        string name,
        decimal quantity,
        MeasurementUnit unit,
        DateTime now
    ) => New(householdId, name, quantity, unit, ShoppingItemSource.MealPlan, null, now);

    public static ShoppingItem CreateRecurring(Product product, DateTime now) =>
        New(
            product.HouseholdId,
            product.Name,
            product.DefaultQuantity,
            product.DefaultUnit,
            ShoppingItemSource.Recurring,
            product.Id,
            now
        );

    public void SetQuantity(decimal? quantity) => Quantity = quantity;

    /// <summary>"Hacer recurrente": the manual item now stands for a catalog product.</summary>
    public void LinkToProduct(Guid productId)
    {
        ProductId = productId;
        Source = ShoppingItemSource.Recurring;
    }

    public void MarkPurchased(DateTime now)
    {
        IsPurchased = true;
        PurchasedAt = now;
    }

    public void MarkPending()
    {
        IsPurchased = false;
        PurchasedAt = null;
    }

    public void Dismiss(DateTime now) => DismissedAt ??= now;
}
