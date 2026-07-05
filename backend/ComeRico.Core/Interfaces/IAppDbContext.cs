using ComeRico.Core.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Interfaces;

public interface IAppDbContext
{
    DbSet<AppUser> Users { get; }
    DbSet<Household> Households { get; }
    DbSet<Dish> Dishes { get; }
    DbSet<RouletteSession> RouletteSessions { get; }
    DbSet<Ingredient> Ingredients { get; }
    DbSet<Tag> Tags { get; }
    DbSet<MealPlan> MealPlans { get; }
    DbSet<ShoppingItem> ShoppingItems { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
