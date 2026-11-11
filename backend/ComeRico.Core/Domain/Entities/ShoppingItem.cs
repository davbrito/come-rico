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

/// <summary>Pending → InCart (reversible, no side effects) → Purchased (only at checkout).</summary>
public enum ShoppingItemStatus
{
    Pending,
    InCart,
    Purchased,
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

    public ShoppingItemStatus Status { get; private set; }

    /// <summary>When someone put it in the cart, and who ("lo tomó Ana"); only while <see cref="ShoppingItemStatus.InCart"/> or after.</summary>
    public DateTime? InCartAt { get; private set; }
    public Guid? InCartByUserId { get; private set; }

    /// <summary>Set at checkout, together with <see cref="ShoppingTripId"/>.</summary>
    public DateTime? PurchasedAt { get; private set; }
    public Guid? ShoppingTripId { get; private set; }

    /// <summary>
    /// A menu item the user removed ("ya tengo"). It is hidden instead of deleted so the next sync
    /// doesn't add it back; it only counts while it is within the sync's look-back window.
    /// </summary>
    public DateTime? DismissedAt { get; private set; }

    public DateTime CreatedAt { get; private set; }

    public Household Household { get; private set; } = null!;

    /// <summary>Still to buy and not yet in the cart.</summary>
    public bool IsPending => Status == ShoppingItemStatus.Pending && DismissedAt is null;

    /// <summary>Shown on the list: pending or in the cart (purchased ones leave it at checkout).</summary>
    public bool IsOnList => Status != ShoppingItemStatus.Purchased && DismissedAt is null;

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

    /// <summary>Someone set the quantity by hand ("eché 2"): the menu sync keeps it instead of recomputing it.</summary>
    public bool QuantityOverridden { get; private set; }

    /// <summary>Quantity computed by the sync (only while nobody overrode it).</summary>
    public void SetQuantity(decimal? quantity) => Quantity = quantity;

    /// <summary>Quantity typed by a person; the sync won't change it afterwards.</summary>
    public void OverrideQuantity(decimal? quantity)
    {
        Quantity = quantity;
        QuantityOverridden = true;
    }

    /// <summary>"Hacer recurrente": the manual item now stands for a catalog product.</summary>
    public void LinkToProduct(Guid productId)
    {
        ProductId = productId;
        Source = ShoppingItemSource.Recurring;
    }

    /// <summary>"Al carrito": no effect on the product or its history, so it can be undone freely.</summary>
    public void PutInCart(Guid userId, DateTime now)
    {
        if (Status != ShoppingItemStatus.Pending)
            return;
        Status = ShoppingItemStatus.InCart;
        InCartAt = now;
        InCartByUserId = userId;
    }

    public void TakeOutOfCart()
    {
        if (Status != ShoppingItemStatus.InCart)
            return;
        Status = ShoppingItemStatus.Pending;
        InCartAt = null;
        InCartByUserId = null;
    }

    /// <summary>Checkout: the cart becomes a purchase of <paramref name="tripId"/>.</summary>
    public void ConfirmPurchase(Guid tripId, DateTime now)
    {
        Status = ShoppingItemStatus.Purchased;
        PurchasedAt = now;
        ShoppingTripId = tripId;
    }

    /// <summary>Undoing a checkout puts the item back in the cart, as it was before paying.</summary>
    public void UndoPurchase()
    {
        Status = ShoppingItemStatus.InCart;
        PurchasedAt = null;
        ShoppingTripId = null;
    }

    public void Dismiss(DateTime now) => DismissedAt ??= now;
}
