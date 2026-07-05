namespace ComeRico.Core.Domain.Entities;

/// <summary>
/// Closed set of units so ingredient amounts can be summed when generating
/// the shopping list (free-text units like "500 gr" + "1 taza" can't be added).
/// </summary>
public enum MeasurementUnit
{
    Piece,
    Gram,
    Kilogram,
    Milliliter,
    Liter,
    Cup,
    Tablespoon,
    Teaspoon,
}
