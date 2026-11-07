namespace ComeRico.Core.Domain.Entities;

public class MealPlan : IHasHousehold
{
    public Guid Id { get; private set; }
    public Guid HouseholdId { get; private set; }
    public Guid DishId { get; private set; }
    public DateOnly Date { get; private set; }
    public MealType MealType { get; private set; }

    /// <summary>How many people this meal is cooked for; ingredients scale by <c>Servings / Dish.Servings</c>.</summary>
    public int Servings { get; private set; } = Portions.Default;
    public DateTime CreatedAt { get; private set; }

    public Household Household { get; private set; } = null!;
    public Dish Dish { get; private set; } = null!;

    private MealPlan() { }

    public static MealPlan Create(
        Guid householdId,
        Guid dishId,
        DateOnly date,
        MealType mealType,
        int servings = Portions.Default
    )
    {
        var now = DateTime.UtcNow;
        return new()
        {
            Id = Guid.CreateVersion7(now),
            CreatedAt = now,
            HouseholdId = householdId,
            DishId = dishId,
            Date = date,
            MealType = mealType,
            Servings = servings,
        };
    }

    public void SetServings(int servings) => Servings = servings;
}

public enum MealType
{
    Breakfast,
    Lunch,
    Dinner,
}
