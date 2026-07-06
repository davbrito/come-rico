namespace ComeRico.Core.Domain.Entities;

public class Dish : IHasHousehold
{
    public Guid Id { get; private set; }
    public Guid HouseholdId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public string? ImageKey { get; private set; }
    public bool IsActive { get; private set; } = true;
    public DateTime CreatedAt { get; private set; }

    public Household Household { get; private set; } = null!;
    public ICollection<Ingredient> Ingredients { get; private set; } = [];
    public ICollection<Tag> Tags { get; private set; } = [];

    private Dish() { }

    public static Dish Create(Guid householdId, string name, string? description = null, string? imageKey = null)
    {
        var now = DateTime.UtcNow;
        return new()
        {
            Id = Guid.CreateVersion7(now),
            CreatedAt = now,
            HouseholdId = householdId,
            Name = name,
            Description = description,
            ImageKey = imageKey,
        };
    }

    public void Deactivate() => IsActive = false;

    public void Update(string name, string? description, string? imageKey)
    {
        Name = name;
        Description = description;
        ImageKey = imageKey;
    }

    public void ReplaceTags(ICollection<Tag> tags)
    {
        Tags = tags;
    }
}
