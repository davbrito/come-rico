namespace ComeRico.Core.Domain.Entities;

public class RouletteSession : IHasHousehold
{
    public Guid Id { get; private set; } = Guid.NewGuid();
    public Guid HouseholdId { get; private set; }
    public RouletteStatus Status { get; private set; } = RouletteStatus.Pending;
    public Guid? WinnerDishId { get; private set; }
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;
    public DateTime? SpunAt { get; private set; }

    public Household Household { get; private set; } = null!;
    public Dish? WinnerDish { get; private set; }

    private RouletteSession() { }

    public static RouletteSession Create(Guid householdId) => new() { HouseholdId = householdId };

    public void SetWinner(Guid winnerDishId)
    {
        WinnerDishId = winnerDishId;
        Status = RouletteStatus.Completed;
        SpunAt = DateTime.UtcNow;
    }

    public void Cancel() => Status = RouletteStatus.Cancelled;
}

public enum RouletteStatus
{
    Pending,
    Spinning,
    Completed,
    Cancelled,
}
