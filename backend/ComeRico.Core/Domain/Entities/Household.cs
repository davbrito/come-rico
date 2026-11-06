namespace ComeRico.Core.Domain.Entities;

public class Household
{
    public Guid Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string InviteCode { get; private set; } = string.Empty;
    public DateTime CreatedAt { get; private set; }

    /// <summary>Optional weekly shopping day; when set, product restock dates are anticipated against the next one.</summary>
    public DayOfWeek? ShoppingDay { get; private set; }

    /// <summary>ISO 4217 currency copied into each recorded purchase that doesn't carry its own.</summary>
    public string DefaultCurrency { get; private set; } = "MXN";

    public ICollection<AppUser> Members { get; private set; } = [];
    public ICollection<Dish> Dishes { get; private set; } = [];
    public ICollection<Tag> Tags { get; private set; } = [];
    public ICollection<MealPlan> MealPlans { get; private set; } = [];
    public ICollection<ShoppingItem> ShoppingItems { get; private set; } = [];
    public ICollection<Product> Products { get; private set; } = [];

    private Household() { }

    public static Household Create(string name)
    {
        var now = DateTime.UtcNow;
        return new()
        {
            Id = Guid.CreateVersion7(now),
            Name = name,
            InviteCode = GenerateInviteCode(),
            CreatedAt = now,
        };
    }

    public void Rename(string newName) => Name = newName;

    public void SetShoppingDay(DayOfWeek? day) => ShoppingDay = day;

    public void SetDefaultCurrency(string currency) => DefaultCurrency = currency.Trim().ToUpperInvariant();

    public void RotateInviteCode() => InviteCode = GenerateInviteCode();

    private static string GenerateInviteCode() => Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
}
