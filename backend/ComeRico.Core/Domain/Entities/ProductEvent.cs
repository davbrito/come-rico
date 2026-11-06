namespace ComeRico.Core.Domain.Entities;

public enum EventOrigin
{
    Web,
    Agent,
}

/// <summary>
/// Append-only history of a <see cref="Product"/> (TPH: one table, one subclass per event type).
/// Written in the same transaction as the state change on the product.
/// </summary>
public abstract class ProductEvent : IHasHousehold
{
    public Guid Id { get; private set; }
    public Guid HouseholdId { get; private set; }
    public Guid ProductId { get; private set; }

    /// <summary>When it happened (the receipt date if it came from one).</summary>
    public DateTime OccurredAt { get; private set; }

    /// <summary>When it was recorded.</summary>
    public DateTime RecordedAt { get; private set; }

    public Guid UserId { get; private set; }
    public EventOrigin Origin { get; private set; }

    protected ProductEvent() { }

    protected void Init(
        Guid householdId,
        Guid productId,
        Guid userId,
        EventOrigin origin,
        DateTime occurredAt,
        DateTime recordedAt
    )
    {
        Id = Guid.CreateVersion7(recordedAt);
        HouseholdId = householdId;
        ProductId = productId;
        UserId = userId;
        Origin = origin;
        OccurredAt = occurredAt;
        RecordedAt = recordedAt;
    }
}

public sealed class ProductPurchased : ProductEvent
{
    public Guid? ShoppingItemId { get; private set; }
    public Guid? ShoppingTripId { get; private set; }

    /// <summary>How much was bought, in <see cref="Unit"/> (2 packages, 0.85 kg).</summary>
    public decimal Quantity { get; private set; }
    public MeasurementUnit Unit { get; private set; }

    /// <summary>Paid for the WHOLE line (net of discounts); unit price = LineTotal / Quantity.</summary>
    public Money? LineTotal { get; private set; }

    public string? Brand { get; private set; }
    public string? Store { get; private set; }
    public string? ReceiptLineText { get; private set; }

    private ProductPurchased() { }

    public static ProductPurchased Create(
        Guid householdId,
        Guid productId,
        Guid userId,
        EventOrigin origin,
        DateTime occurredAt,
        DateTime recordedAt,
        decimal quantity,
        MeasurementUnit unit,
        Guid? shoppingItemId = null,
        Guid? shoppingTripId = null,
        Money? lineTotal = null,
        string? brand = null,
        string? store = null,
        string? receiptLineText = null
    )
    {
        var e = new ProductPurchased
        {
            Quantity = quantity,
            Unit = unit,
            ShoppingItemId = shoppingItemId,
            ShoppingTripId = shoppingTripId,
            LineTotal = lineTotal,
            Brand = brand,
            Store = store,
            ReceiptLineText = receiptLineText,
        };
        e.Init(householdId, productId, userId, origin, occurredAt, recordedAt);
        return e;
    }
}

public sealed class ProductPurchaseReverted : ProductEvent
{
    public Guid PurchaseEventId { get; private set; }

    private ProductPurchaseReverted() { }

    public static ProductPurchaseReverted Create(
        Guid householdId,
        Guid productId,
        Guid userId,
        EventOrigin origin,
        DateTime now,
        Guid purchaseEventId
    )
    {
        var e = new ProductPurchaseReverted { PurchaseEventId = purchaseEventId };
        e.Init(householdId, productId, userId, origin, now, now);
        return e;
    }
}

public sealed class ProductMarkedOutOfStock : ProductEvent
{
    private ProductMarkedOutOfStock() { }

    public static ProductMarkedOutOfStock Create(Guid householdId, Guid productId, Guid userId, EventOrigin origin, DateTime now)
    {
        var e = new ProductMarkedOutOfStock();
        e.Init(householdId, productId, userId, origin, now, now);
        return e;
    }
}

public sealed class ProductSnoozed : ProductEvent
{
    public int Days { get; private set; }

    private ProductSnoozed() { }

    public static ProductSnoozed Create(Guid householdId, Guid productId, Guid userId, EventOrigin origin, DateTime now, int days)
    {
        var e = new ProductSnoozed { Days = days };
        e.Init(householdId, productId, userId, origin, now, now);
        return e;
    }
}

public sealed class ProductIntervalChanged : ProductEvent
{
    public int? OldDays { get; private set; }
    public int? NewDays { get; private set; }

    private ProductIntervalChanged() { }

    public static ProductIntervalChanged Create(
        Guid householdId,
        Guid productId,
        Guid userId,
        EventOrigin origin,
        DateTime now,
        int? oldDays,
        int? newDays
    )
    {
        var e = new ProductIntervalChanged { OldDays = oldDays, NewDays = newDays };
        e.Init(householdId, productId, userId, origin, now, now);
        return e;
    }
}
