namespace ComeRico.Core.Domain.Entities;

/// <summary>
/// A purchase confirmed at the till ("Terminar compra", spike 3.4): every item that was in the cart becomes
/// <see cref="ShoppingItemStatus.Purchased"/> and each one linked to a product logs a <see cref="ProductPurchased"/>.
/// </summary>
public class ShoppingTrip : IHasHousehold
{
    public Guid Id { get; private set; }
    public Guid HouseholdId { get; private set; }
    public Guid UserId { get; private set; }
    public DateTime CompletedAt { get; private set; }
    public string? Store { get; private set; }

    /// <summary>Optional single number typed when paying (or the receipt total).</summary>
    public Money? TotalPaid { get; private set; }

    public EventOrigin Origin { get; private set; }

    /// <summary>Set by "Deshacer la última compra"; a reverted trip no longer counts.</summary>
    public DateTime? RevertedAt { get; private set; }

    private ShoppingTrip() { }

    public static ShoppingTrip Create(
        Guid householdId,
        Guid userId,
        DateTime completedAt,
        string? store,
        Money? totalPaid,
        EventOrigin origin
    ) =>
        new()
        {
            Id = Guid.CreateVersion7(completedAt),
            HouseholdId = householdId,
            UserId = userId,
            CompletedAt = completedAt,
            Store = store,
            TotalPaid = totalPaid,
            Origin = origin,
        };

    public void Revert(DateTime now) => RevertedAt ??= now;
}
