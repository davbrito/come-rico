using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Commands;
using ComeRico.Core.Features.Shopping.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Shopping.Commands;

/// <summary>
/// "Hacer recurrente": turns a pending manual item into a catalog product (or links it to an active one with
/// the same name), using the item's quantity and unit as the defaults. The item stays on the list as that
/// product's purchase.
/// </summary>
public sealed record MakeShoppingItemRecurringCommand(Guid Id, ProductCategory Category, int? RestockIntervalDays)
    : IRequest<ShoppingItemDto?>;

public sealed class MakeShoppingItemRecurringCommandValidator : AbstractValidator<MakeShoppingItemRecurringCommand>
{
    public MakeShoppingItemRecurringCommandValidator()
    {
        RuleFor(x => x.Category).IsInEnum().WithMessage("La categoría no es válida.");
        RuleFor(x => x.RestockIntervalDays)
            .InclusiveBetween(RestockRule.MinIntervalDays, 3650)
            .WithMessage($"El intervalo debe estar entre {RestockRule.MinIntervalDays} y 3650 días.")
            .When(x => x.RestockIntervalDays is not null);
    }
}

public sealed class MakeShoppingItemRecurringCommandHandler(IAppDbContext dbContext, TimeProvider clock)
    : IRequestHandler<MakeShoppingItemRecurringCommand, ShoppingItemDto?>
{
    public async Task<ShoppingItemDto?> Handle(MakeShoppingItemRecurringCommand request, CancellationToken cancellationToken)
    {
        var item = await dbContext.ShoppingItems.FirstOrDefaultAsync(
            s => s.Id == request.Id && s.DismissedAt == null,
            cancellationToken
        );
        if (item is null)
            return null;
        if (item.Source != ShoppingItemSource.Manual || item.ProductId is not null || item.IsPurchased)
            throw new InvalidOperationException("Solo se puede hacer recurrente un artículo manual pendiente.");

        var ctx = await dbContext.GetHouseholdContextAsync(clock, cancellationToken);
        var name = item.Name.Trim();
        var lowered = name.ToLower();
        var product = await dbContext.Products.FirstOrDefaultAsync(
            p => p.IsActive && p.Name.ToLower() == lowered,
            cancellationToken
        );

        if (product is null)
        {
            product = Product.Create(
                ctx.HouseholdId,
                name,
                request.Category,
                item.Quantity,
                item.Unit,
                request.RestockIntervalDays,
                preferredBrand: null,
                clock.GetUtcNow().UtcDateTime
            );
            dbContext.Products.Add(product);
        }
        else if (
            await dbContext.ShoppingItems.AnyAsync(
                s => s.ProductId == product.Id && !s.IsPurchased && s.DismissedAt == null,
                cancellationToken
            )
        )
        {
            // The product is already on the list: this item is a duplicate of it.
            dbContext.ShoppingItems.Remove(item);
            await dbContext.SaveChangesAsync(cancellationToken);
            var existing = await dbContext.ShoppingItems.FirstAsync(
                s => s.ProductId == product.Id && !s.IsPurchased && s.DismissedAt == null,
                cancellationToken
            );
            return await existing.ToDtoAsync(dbContext, ctx, cancellationToken);
        }

        item.LinkToProduct(product.Id);
        await dbContext.SaveChangesAsync(cancellationToken);
        return await item.ToDtoAsync(dbContext, ctx, cancellationToken);
    }
}
