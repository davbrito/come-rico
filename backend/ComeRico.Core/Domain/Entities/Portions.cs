namespace ComeRico.Core.Domain.Entities;

/// <summary>Portions (spike 3.5): a dish yields <c>Dish.Servings</c>; a planned meal cooks for <c>MealPlan.Servings</c>.</summary>
public static class Portions
{
    public const int Default = 2;
    public const int Min = 1;
    public const int Max = 50;

    /// <summary>
    /// How much of an ingredient a planned meal needs: <c>quantity * planned / yields</c>.
    /// Not rounded here; the list rounds the consolidated total (see <see cref="RoundForList"/>).
    /// </summary>
    public static decimal Scale(decimal quantity, int planned, int yields) =>
        yields <= 0 ? quantity : quantity * planned / yields;

    /// <summary>
    /// Countable units (pieces, packages) are bought whole, so they round up; the rest keep two decimals.
    /// </summary>
    public static decimal RoundForList(decimal quantity, MeasurementUnit unit) =>
        unit is MeasurementUnit.Piece or MeasurementUnit.Package
            ? Math.Ceiling(quantity)
            : Math.Round(quantity, 2, MidpointRounding.AwayFromZero);
}
