using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options, ITenantService tenantService)
    : IdentityDbContext<AppUser, IdentityRole<Guid>, Guid>(options),
        IAppDbContext,
        IDataProtectionKeyContext
{
    // Shared storage for ASP.NET Core Data Protection keys. Without this, each
    // container instance generates its own in-memory keyring and cookies issued
    // by one instance fail to decrypt on another (random session loss).
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    public DbSet<Household> Households => Set<Household>();
    public DbSet<Dish> Dishes => Set<Dish>();
    public DbSet<RouletteSession> RouletteSessions => Set<RouletteSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.Property(u => u.DisplayName).IsRequired().HasMaxLength(200);
            entity.Property(u => u.Role).HasConversion<string>().IsRequired();

            entity
                .HasOne(u => u.Household)
                .WithMany(h => h.Members)
                .HasForeignKey(u => u.HouseholdId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Household>(entity =>
        {
            entity.HasKey(h => h.Id);
            entity.Property(h => h.Name).IsRequired().HasMaxLength(200);
            entity.Property(h => h.InviteCode).IsRequired().HasMaxLength(20);
            entity.HasIndex(h => h.InviteCode).IsUnique();

            entity
                .HasMany(h => h.Dishes)
                .WithOne(d => d.Household)
                .HasForeignKey(d => d.HouseholdId)
                .OnDelete(DeleteBehavior.Cascade);

            entity
                .HasMany(h => h.RouletteSessions)
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
        });

        modelBuilder.Entity<RouletteSession>(entity =>
        {
            entity.HasKey(r => r.Id);
            entity.Property(r => r.Status).HasConversion<string>().IsRequired();

            entity
                .HasOne(r => r.WinnerDish)
                .WithMany()
                .HasForeignKey(r => r.WinnerDishId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.ApplyHouseholdFilters(tenantService);
    }
}
