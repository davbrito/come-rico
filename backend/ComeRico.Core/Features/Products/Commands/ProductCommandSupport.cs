using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Products.Commands;

internal static class ProductCommandSupport
{
    public static async Task<DayOfWeek?> GetShoppingDayAsync(this IAppDbContext db, CancellationToken ct) =>
        await db.Households.Where(h => h.Id == db.CurrentHouseholdId).Select(h => h.ShoppingDay).FirstOrDefaultAsync(ct);

    public static Task<Product?> FindActiveAsync(this IAppDbContext db, Guid id, CancellationToken ct) =>
        db.Products.FirstOrDefaultAsync(p => p.Id == id && p.IsActive, ct);

    public static DateOnly Today(this TimeProvider clock) => DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);

    public static DateTime AtUtcMidnight(this DateOnly date) => date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);

    /// <summary>Shared rules for the editable catalog fields (create and update).</summary>
    public static void AddProductFieldRules<T>(
        this AbstractValidator<T> v,
        Func<T, string> name,
        Func<T, ProductCategory> category,
        Func<T, decimal?> quantity,
        Func<T, MeasurementUnit?> unit,
        Func<T, int?> interval,
        Func<T, string?> brand
    )
    {
        v.RuleFor(x => name(x))
            .NotEmpty()
            .WithMessage("El nombre del producto es obligatorio.")
            .MaximumLength(200)
            .WithMessage("El nombre no puede superar los 200 caracteres.");
        v.RuleFor(x => category(x)).IsInEnum().WithMessage("La categoría no es válida.");
        v.RuleFor(x => quantity(x))
            .GreaterThan(0)
            .WithMessage("La cantidad por defecto debe ser mayor que cero.")
            .When(x => quantity(x) is not null);
        v.RuleFor(x => unit(x)).IsInEnum().WithMessage("La unidad de medida no es válida.").When(x => unit(x) is not null);
        v.RuleFor(x => interval(x))
            .InclusiveBetween(1, 3650)
            .WithMessage("El intervalo debe estar entre 1 y 3650 días.")
            .When(x => interval(x) is not null);
        v.RuleFor(x => brand(x))
            .MaximumLength(100)
            .WithMessage("La marca no puede superar los 100 caracteres.")
            .When(x => brand(x) is not null);
    }

    public static string? NormalizeBrand(string? brand) => string.IsNullOrWhiteSpace(brand) ? null : brand.Trim();

    public static ProductDto ToDto(this Product p, TimeProvider clock, DayOfWeek? shoppingDay) =>
        p.ToDto(clock.Today(), shoppingDay);
}
