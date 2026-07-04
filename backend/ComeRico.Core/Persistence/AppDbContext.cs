using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options, ITenantService tenantService)
    : DbContext(options), IAppDbContext
{
    public DbSet<Household> Households => Set<Household>();
    public DbSet<Dish> Dishes => Set<Dish>();
    public DbSet<RouletteSession> RouletteSessions => Set<RouletteSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Household>(entity =>
        {
            entity.HasKey(h => h.Id);
            entity.Property(h => h.Name).IsRequired().HasMaxLength(200);
            entity.Property(h => h.InviteCode).IsRequired().HasMaxLength(20);
            entity.HasIndex(h => h.InviteCode).IsUnique();

            entity.HasMany(h => h.Dishes)
                  .WithOne(d => d.Household)
                  .HasForeignKey(d => d.HouseholdId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(h => h.RouletteSessions)
                  .WithOne(r => r.Household)
                  .HasForeignKey(r => r.HouseholdId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Dish>(entity =>
        {
            entity.HasKey(d => d.Id);
            entity.Property(d => d.Name).IsRequired().HasMaxLength(200);
            entity.Property(d => d.Description).HasMaxLength(1000);
            entity.Property(d => d.ImageUrl).HasMaxLength(2048);

            // Global query filter: automatically scope dishes to current household
            entity.HasQueryFilter(d =>
                !tenantService.IsResolved || d.HouseholdId == tenantService.HouseholdId);
        });

        modelBuilder.Entity<RouletteSession>(entity =>
        {
            entity.HasKey(r => r.Id);
            entity.Property(r => r.Status)
                  .HasConversion<string>()
                  .IsRequired();

            entity.HasOne(r => r.WinnerDish)
                  .WithMany()
                  .HasForeignKey(r => r.WinnerDishId)
                  .OnDelete(DeleteBehavior.Restrict);

            // Global query filter: automatically scope roulette sessions to current household
            entity.HasQueryFilter(r =>
                !tenantService.IsResolved || r.HouseholdId == tenantService.HouseholdId);
        });
    }
}
