using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Products.Commands;

internal static class ProductCommandSupport
{
    /// <summary>The household's shopping day and its local "today" (from its time zone).</summary>
    public static async Task<HouseholdContext> GetHouseholdContextAsync(
        this IAppDbContext db,
        TimeProvider clock,
        CancellationToken ct
    )
    {
        var h = await db
            .Households.Where(x => x.Id == db.CurrentHouseholdId)
            .Select(x => new { x.ShoppingDay, x.TimeZone })
            .FirstOrDefaultAsync(ct);
        var tz = h?.TimeZone ?? "UTC";
        return new(db.CurrentHouseholdId, h?.ShoppingDay, HouseholdTime.Today(tz, clock), tz);
    }

    /// <summary>
    /// "Todavía tengo": snoozes the time-based reminder for <paramref name="days"/> and logs it.
    /// With a shopping day the rule compares against the next one, so the snooze always skips at least that
    /// trip; snoozing again never shortens an existing, longer snooze. Returns the effective end date.
    /// </summary>
    public static DateOnly Snooze(
        this IAppDbContext db,
        Product product,
        HouseholdContext ctx,
        int days,
        Guid userId,
        DateTime now
    )
    {
        var today = ctx.Today;
        var until = today.AddDays(days);

        if (ctx.ShoppingDay is { } day)
        {
            var afterNextShopping = RestockRule.NextShoppingDay(today, day).AddDays(1);
            if (until < afterNextShopping)
                until = afterNextShopping;
        }

        if (product.SnoozedUntil is { } current && current > until)
            until = current;

        product.SnoozeUntil(until);
        db.ProductEvents.Add(
            ProductSnoozed.Create(
                product.HouseholdId,
                product.Id,
                userId,
                EventOrigin.Web,
                now,
                until.DayNumber - today.DayNumber
            )
        );
        return until;
    }

    /// <summary>
    /// Days for "Saltar esta compra": with a shopping day, 1 is enough (the snooze is stretched past the next
    /// trip); without one, the shortest option (+3 días).
    /// </summary>
    public static int SkipThisShoppingDays(HouseholdContext ctx) => ctx.ShoppingDay is null ? 3 : 1;

    public static Task<Product?> FindActiveAsync(this IAppDbContext db, Guid id, CancellationToken ct) =>
        db.Products.FirstOrDefaultAsync(p => p.Id == id && p.IsActive, ct);

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
            .InclusiveBetween(RestockRule.MinIntervalDays, 3650)
            .WithMessage($"El intervalo debe estar entre {RestockRule.MinIntervalDays} y 3650 días.")
            .When(x => interval(x) is not null);
        v.RuleFor(x => brand(x))
            .MaximumLength(100)
            .WithMessage("La marca no puede superar los 100 caracteres.")
            .When(x => brand(x) is not null);
    }

    public static string? NormalizeBrand(string? brand) => string.IsNullOrWhiteSpace(brand) ? null : brand.Trim();

    public static ProductDto ToDto(this Product p, HouseholdContext ctx) => p.ToDto(ctx.Today, ctx.ShoppingDay);

    /// <summary>The declared last-purchase date can't be in the future (in the household's local time).</summary>
    public static void EnsureNotInFuture(DateOnly? lastPurchasedOn, DateOnly today)
    {
        if (lastPurchasedOn > today)
            throw new ValidationException([
                new FluentValidation.Results.ValidationFailure(
                    "LastPurchasedOn",
                    "La fecha de última compra no puede estar en el futuro."
                ),
            ]);
    }
}

internal sealed record HouseholdContext(Guid HouseholdId, DayOfWeek? ShoppingDay, DateOnly Today, string TimeZone);
