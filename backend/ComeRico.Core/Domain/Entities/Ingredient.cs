namespace ComeRico.Core.Domain.Entities;

public class Ingredient : IHasHousehold
{
    public Guid Id { get; private set; }
    public Guid HouseholdId { get; private set; }
    public Guid DishId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public decimal Amount { get; private set; }
    public MeasurementUnit Unit { get; private set; } = MeasurementUnit.Piece;

    public Dish Dish { get; private set; } = null!;

    private Ingredient() { }

    public static Ingredient Create(Guid householdId, Guid dishId, string name, decimal amount, MeasurementUnit unit) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            HouseholdId = householdId,
            DishId = dishId,
            Name = name,
            Amount = amount,
            Unit = unit,
        };
}
