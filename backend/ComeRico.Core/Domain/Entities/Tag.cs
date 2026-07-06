namespace ComeRico.Core.Domain.Entities;

public class Tag : IHasHousehold
{
    public Guid Id { get; private set; }
    public Guid HouseholdId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public DateTime CreatedAt { get; private set; }

    public Household Household { get; private set; } = null!;
    public ICollection<Dish> Dishes { get; private set; } = [];

    private Tag() { }

    public static Tag Create(Guid householdId, string name)
    {
        var now = DateTime.UtcNow;
        return new()
        {
            Id = Guid.CreateVersion7(now),
            CreatedAt = now,
            HouseholdId = householdId,
            Name = name,
        };
    }

    public void Rename(string name) => Name = name;
}
