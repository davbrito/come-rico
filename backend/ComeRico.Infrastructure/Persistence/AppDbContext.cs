using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Infrastructure.Persistence;

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
    public DbSet<Ingredient> Ingredients => Set<Ingredient>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<MealPlan> MealPlans => Set<MealPlan>();
    public DbSet<ShoppingItem> ShoppingItems => Set<ShoppingItem>();
    public DbSet<StoredFile> StoredFiles => Set<StoredFile>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductEvent> ProductEvents => Set<ProductEvent>();

    public Guid CurrentHouseholdId => tenantService.HouseholdId;

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
            entity.Property(h => h.TimeZone).IsRequired().HasMaxLength(64).HasDefaultValue("UTC");
            entity.Property(h => h.ShoppingDay).HasConversion<string>().HasMaxLength(20);
            entity.Property(h => h.DefaultCurrency).IsRequired().HasMaxLength(3).IsFixedLength().HasDefaultValue("USD");
            entity.HasIndex(h => h.InviteCode).IsUnique();

            entity
                .HasMany(h => h.Dishes)
                .WithOne(d => d.Household)
                .HasForeignKey(d => d.HouseholdId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Dish>(entity =>
        {
            entity.HasKey(d => d.Id);
            entity.Property(d => d.Name).IsRequired().HasMaxLength(200);
            entity.Property(d => d.Description).HasMaxLength(1000);
            entity.Property(d => d.ImageKey).HasMaxLength(2048);
        });

        modelBuilder.Entity<Ingredient>(entity =>
        {
            entity.HasKey(i => i.Id);
            entity.Property(i => i.Name).IsRequired().HasMaxLength(200);
            entity.Property(i => i.Amount).HasPrecision(10, 2);
            entity.Property(i => i.Unit).HasConversion<string>().IsRequired();

            entity.HasOne(i => i.Dish).WithMany(d => d.Ingredients).HasForeignKey(i => i.DishId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Tag>(entity =>
        {
            entity.HasKey(t => t.Id);
            entity.Property(t => t.Name).IsRequired().HasMaxLength(50);
            entity.HasIndex(t => new { t.HouseholdId, t.Name }).IsUnique();

            entity
                .HasOne(t => t.Household)
                .WithMany(h => h.Tags)
                .HasForeignKey(t => t.HouseholdId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(t => t.Dishes).WithMany(d => d.Tags).UsingEntity("DishTags");
        });

        modelBuilder.Entity<MealPlan>(entity =>
        {
            entity.HasKey(m => m.Id);
            entity.Property(m => m.MealType).HasConversion<string>().IsRequired();
            entity.HasIndex(m => new { m.HouseholdId, m.Date });

            entity
                .HasOne(m => m.Household)
                .WithMany(h => h.MealPlans)
                .HasForeignKey(m => m.HouseholdId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(m => m.Dish).WithMany().HasForeignKey(m => m.DishId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ShoppingItem>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.Property(s => s.Name).IsRequired().HasMaxLength(200);
            entity.Property(s => s.Amount).HasPrecision(10, 2);
            entity.Property(s => s.Unit).HasConversion<string>();
            entity.HasIndex(s => new { s.HouseholdId, s.GeneratedForWeekStart });

            entity
                .HasOne(s => s.Household)
                .WithMany(h => h.ShoppingItems)
                .HasForeignKey(s => s.HouseholdId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<StoredFile>(entity =>
        {
            entity.HasKey(i => i.Id);
            entity.Property(i => i.Key).IsRequired().HasMaxLength(512);
            entity.Property(i => i.ContentType).IsRequired().HasMaxLength(100);
            entity.Property(i => i.Status).HasConversion<string>().IsRequired();
            entity.HasIndex(i => new { i.HouseholdId, i.Key });
            entity.HasIndex(i => new { i.Status, i.CreatedAt });

            entity.HasOne(i => i.Household).WithMany().HasForeignKey(i => i.HouseholdId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Product>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Name).IsRequired().HasMaxLength(200);
            entity.Property(p => p.Category).HasConversion<string>().HasMaxLength(20).IsRequired();
            entity.Property(p => p.DefaultQuantity).HasPrecision(12, 4);
            entity.Property(p => p.DefaultUnit).HasConversion<string>().HasMaxLength(20);
            entity.Property(p => p.PreferredBrand).HasMaxLength(100);
            entity.Property(p => p.LastPurchasedQuantity).HasPrecision(12, 4);
            entity.Property(p => p.LastPurchasedUnit).HasConversion<string>().HasMaxLength(20);
            entity.HasIndex(p => new { p.HouseholdId, p.Name });

            entity.ToTable(t =>
            {
                t.HasCheckConstraint(
                    "CK_Products_RestockIntervalDays",
                    "\"RestockIntervalDays\" IS NULL OR \"RestockIntervalDays\" > 1"
                );
                t.HasCheckConstraint("CK_Products_DefaultQuantity", "\"DefaultQuantity\" IS NULL OR \"DefaultQuantity\" > 0");
            });

            entity
                .HasOne(p => p.Household)
                .WithMany(h => h.Products)
                .HasForeignKey(p => p.HouseholdId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ProductEvent>(entity =>
        {
            entity.ToTable(
                "ProductEvents",
                t =>
                {
                    t.HasCheckConstraint(
                        "CK_ProductEvents_Purchased",
                        "\"Type\" <> 'Purchased' OR (\"Quantity\" IS NOT NULL AND \"Unit\" IS NOT NULL)"
                    );
                    t.HasCheckConstraint(
                        "CK_ProductEvents_PurchaseReverted",
                        "\"Type\" <> 'PurchaseReverted' OR \"PurchaseEventId\" IS NOT NULL"
                    );
                    t.HasCheckConstraint("CK_ProductEvents_Snoozed", "\"Type\" <> 'Snoozed' OR \"Days\" IS NOT NULL");
                    t.HasCheckConstraint(
                        "CK_ProductEvents_LastPurchaseDeclared",
                        "\"Type\" <> 'LastPurchaseDeclared' OR \"DeclaredOn\" IS NOT NULL"
                    );
                    t.HasCheckConstraint(
                        "CK_ProductEvents_LineTotal",
                        "(\"LineTotal_Amount\" IS NULL) = (\"LineTotal_Currency\" IS NULL) AND (\"LineTotal_Amount\" IS NULL OR \"Type\" = 'Purchased')"
                    );
                }
            );
            entity.HasKey(e => e.Id);
            entity
                .HasDiscriminator<string>("Type")
                .HasValue<ProductPurchased>("Purchased")
                .HasValue<ProductPurchaseReverted>("PurchaseReverted")
                .HasValue<ProductMarkedOutOfStock>("OutOfStock")
                .HasValue<ProductSnoozed>("Snoozed")
                .HasValue<ProductIntervalChanged>("IntervalChanged")
                .HasValue<ProductLastPurchaseDeclared>("LastPurchaseDeclared")
                .HasValue<ProductMarkedInStock>("InStock");
            entity.Property<string>("Type").HasMaxLength(30);
            entity.Property(e => e.Origin).HasConversion<string>().HasMaxLength(10).IsRequired();
            entity.HasIndex(e => new
            {
                e.HouseholdId,
                e.ProductId,
                e.OccurredAt,
            });

            entity.HasOne<Product>().WithMany().HasForeignKey(e => e.ProductId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<Household>().WithMany().HasForeignKey(e => e.HouseholdId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ProductPurchased>(entity =>
        {
            entity.Property(e => e.Quantity).HasPrecision(12, 4);
            entity.Property(e => e.Unit).HasConversion<string>().HasMaxLength(20);
            entity.Property(e => e.Brand).HasMaxLength(100);
            entity.Property(e => e.Store).HasMaxLength(100);
            entity.Property(e => e.ReceiptLineText).HasMaxLength(300);
            entity.OwnsOne(
                e => e.LineTotal,
                m =>
                {
                    m.Property(x => x.Amount).HasPrecision(12, 2);
                    m.Property(x => x.Currency).HasMaxLength(3).IsFixedLength();
                }
            );
        });

        modelBuilder.ApplyHouseholdFilters(this);
    }
}
