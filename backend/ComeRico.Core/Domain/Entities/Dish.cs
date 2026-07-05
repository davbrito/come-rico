namespace ComeRico.Core.Domain.Entities;

public class Dish : IHasHousehold
{
    public Guid Id { get; private set; } = Guid.NewGuid();
    public Guid HouseholdId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public string? ImageUrl { get; private set; }
    public bool IsActive { get; private set; } = true;
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;

    public Household Household { get; private set; } = null!;
    public ICollection<Ingredient> Ingredients { get; private set; } = [];
    public ICollection<Tag> Tags { get; private set; } = [];

    private Dish() { }

    public static Dish Create(Guid householdId, string name, string? description = null, string? imageUrl = null) =>
        new()
        {
            HouseholdId = householdId,
            Name = name,
            Description = description,
            ImageUrl = imageUrl,
        };

    public void Deactivate() => IsActive = false;

    public void Update(string name, string? description, string? imageUrl)
    {
        Name = name;
        Description = description;
        ImageUrl = imageUrl;
    }

    public void ReplaceTags(IEnumerable<Tag> tags)
    {
        Tags.Clear();
        foreach (var tag in tags)
            Tags.Add(tag);
    }
}
