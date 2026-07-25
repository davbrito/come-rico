using ComeRico.Core.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace ComeRico.Core.Interfaces;

public interface IAppDbContext
{
    DbSet<AppUser> Users { get; }
    DbSet<Household> Households { get; }
    DbSet<Dish> Dishes { get; }
    DbSet<Ingredient> Ingredients { get; }
    DbSet<Tag> Tags { get; }
    DbSet<MealPlan> MealPlans { get; }
    DbSet<ShoppingItem> ShoppingItems { get; }
    DbSet<StoredFile> StoredFiles { get; }

    Guid CurrentHouseholdId { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);

    // Entry
    EntityEntry<T> Entry<T>(T entity)
        where T : class;
}
