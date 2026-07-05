namespace ComeRico.Core.Domain.Entities;

public class MealPlan : IHasHousehold
{
    public Guid Id { get; private set; } = Guid.NewGuid();
    public Guid HouseholdId { get; private set; }
    public Guid DishId { get; private set; }
    public DateOnly Date { get; private set; }
    public MealType MealType { get; private set; }
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;

    public Household Household { get; private set; } = null!;
    public Dish Dish { get; private set; } = null!;

    private MealPlan() { }

    public static MealPlan Create(Guid householdId, Guid dishId, DateOnly date, MealType mealType) =>
        new()
        {
            HouseholdId = householdId,
            DishId = dishId,
            Date = date,
            MealType = mealType,
        };
}

public enum MealType
{
    Breakfast,
    Lunch,
    Dinner,
}
