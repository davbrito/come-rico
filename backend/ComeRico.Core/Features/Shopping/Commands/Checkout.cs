using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Commands;
using ComeRico.Core.Features.Shopping.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Shopping.Commands;

/// <summary>
/// "Terminar compra / Pagué" (spike 3.4), in one <c>SaveChanges</c>: creates the <see cref="ShoppingTrip"/>,
/// turns everything in the cart into <see cref="ShoppingItemStatus.Purchased"/> (it leaves the list), logs
/// <see cref="ProductPurchased"/> for each item with a product and updates that product. What's still pending
/// stays on the list for the next trip. Store and total are optional; the total is in the household's currency.
/// </summary>
public sealed record CheckoutCommand(string? Store, decimal? TotalPaid) : IRequest<ShoppingTripDto>;

public sealed class CheckoutCommandValidator : AbstractValidator<CheckoutCommand>
{
    public CheckoutCommandValidator()
    {
        RuleFor(x => x.Store)
            .MaximumLength(100)
            .WithMessage("La tienda no puede superar los 100 caracteres.")
            .When(x => x.Store is not null);
        RuleFor(x => x.TotalPaid)
            .GreaterThan(0)
            .WithMessage("El total pagado debe ser mayor que cero.")
            .LessThan(10_000_000_000m)
            .WithMessage("El total pagado es demasiado grande.")
            .When(x => x.TotalPaid is not null);
    }
}

public sealed class CheckoutCommandHandler(IAppDbContext dbContext, ICurrentUserService currentUser, TimeProvider clock)
    : IRequestHandler<CheckoutCommand, ShoppingTripDto>
{
    public async Task<ShoppingTripDto> Handle(CheckoutCommand request, CancellationToken cancellationToken)
    {
        var cart = await dbContext
            .ShoppingItems.Where(s => s.Status == ShoppingItemStatus.InCart && s.DismissedAt == null)
            .ToListAsync(cancellationToken);
        if (cart.Count == 0)
            throw new InvalidOperationException("El carrito está vacío: marca lo que llevas antes de terminar la compra.");

        var ctx = await dbContext.GetHouseholdContextAsync(clock, cancellationToken);
        var currency = await dbContext
            .Households.Where(h => h.Id == ctx.HouseholdId)
            .Select(h => h.DefaultCurrency)
            .FirstOrDefaultAsync(cancellationToken);
        var now = clock.GetUtcNow().UtcDateTime;
        var store = string.IsNullOrWhiteSpace(request.Store) ? null : request.Store.Trim();
        var total = request.TotalPaid is { } amount ? new Money(Math.Round(amount, 2), currency ?? "USD") : null;

        var trip = ShoppingTrip.Create(ctx.HouseholdId, currentUser.UserId, now, store, total, EventOrigin.Web);
        dbContext.ShoppingTrips.Add(trip);

        var productIds = cart.Where(i => i.ProductId != null).Select(i => i.ProductId!.Value).Distinct().ToList();
        var products = await dbContext
            .Products.Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, cancellationToken);

        foreach (var item in cart)
        {
            item.ConfirmPurchase(trip.Id, now);
            if (item.ProductId is { } id && products.TryGetValue(id, out var product))
                dbContext.RecordPurchase(product, item, ctx, currentUser.UserId, now, trip.Id, store);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return trip.ToDto(cart.Count);
    }
}

/// <summary>
/// "Deshacer la última compra", for a checkout confirmed by mistake: only the household's latest trip that
/// isn't reverted yet. Its items go back to the cart, and each product purchase is reverted (the product's
/// last purchase comes back from its history).
/// </summary>
public sealed record UndoCheckoutCommand(Guid TripId) : IRequest<ShoppingTripDto?>;

public sealed class UndoCheckoutCommandHandler(IAppDbContext dbContext, ICurrentUserService currentUser, TimeProvider clock)
    : IRequestHandler<UndoCheckoutCommand, ShoppingTripDto?>
{
    public async Task<ShoppingTripDto?> Handle(UndoCheckoutCommand request, CancellationToken cancellationToken)
    {
        var trip = await dbContext.ShoppingTrips.FirstOrDefaultAsync(t => t.Id == request.TripId, cancellationToken);
        if (trip is null)
            return null;
        if (trip.RevertedAt is not null)
            throw new InvalidOperationException("Esa compra ya se deshizo.");

        var latest = await dbContext
            .ShoppingTrips.Where(t => t.RevertedAt == null)
            .OrderByDescending(t => t.CompletedAt)
            .Select(t => t.Id)
            .FirstAsync(cancellationToken);
        if (latest != trip.Id)
            throw new InvalidOperationException("Solo se puede deshacer la última compra.");

        var ctx = await dbContext.GetHouseholdContextAsync(clock, cancellationToken);
        var now = clock.GetUtcNow().UtcDateTime;
        var items = await dbContext.ShoppingItems.Where(s => s.ShoppingTripId == trip.Id).ToListAsync(cancellationToken);
        foreach (var item in items)
            item.UndoPurchase();

        var productIds = items.Where(i => i.ProductId != null).Select(i => i.ProductId!.Value).Distinct().ToList();
        var products = await dbContext.Products.Where(p => productIds.Contains(p.Id)).ToListAsync(cancellationToken);
        foreach (var product in products)
            await dbContext.RevertTripPurchasesAsync(product, trip.Id, ctx, currentUser.UserId, now, cancellationToken);

        trip.Revert(now);
        await dbContext.SaveChangesAsync(cancellationToken);
        return trip.ToDto(items.Count);
    }
}
