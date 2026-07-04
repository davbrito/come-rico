namespace ComeRico.Core.Domain.Entities;

public class Household
{
    public Guid Id { get; private set; } = Guid.NewGuid();
    public string Name { get; private set; } = string.Empty;
    public string InviteCode { get; private set; } = Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;

    public ICollection<Dish> Dishes { get; private set; } = [];
    public ICollection<RouletteSession> RouletteSessions { get; private set; } = [];

    private Household() { }

    public static Household Create(string name) => new() { Name = name };
}
