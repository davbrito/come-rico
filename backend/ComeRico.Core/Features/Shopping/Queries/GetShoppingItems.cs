using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Commands;
using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Shopping.Queries;

public sealed record GetShoppingItemsQuery : IRequest<IReadOnlyList<ShoppingItemDto>>;

/// <param name="ProductStatus">The linked product's restock status (null without a product): an
/// <c>OutOfStock</c> one can't be snoozed, and removing it means "sí hay".</param>
public sealed record ShoppingItemDto(
    Guid Id,
    string Name,
    decimal? Quantity,
    MeasurementUnit? Unit,
    ShoppingItemSource Source,
    Guid? ProductId,
    RestockStatus? ProductStatus,
    bool IsPurchased,
    DateTime? PurchasedAt,
    DateTime CreatedAt
);

public static class ShoppingItemDtoMapper
{
    public static ShoppingItemDto ToDto(this ShoppingItem item, RestockStatus? productStatus) =>
        new(
            item.Id,
            item.Name,
            item.Quantity,
            item.Unit,
            item.Source,
            item.ProductId,
            productStatus,
            item.IsPurchased,
            item.PurchasedAt,
            item.CreatedAt
        );
}

public sealed class GetShoppingItemsQueryHandler(IAppDbContext dbContext, TimeProvider clock)
    : IRequestHandler<GetShoppingItemsQuery, IReadOnlyList<ShoppingItemDto>>
{
    public async Task<IReadOnlyList<ShoppingItemDto>> Handle(GetShoppingItemsQuery request, CancellationToken cancellationToken)
    {
        var ctx = await dbContext.GetHouseholdContextAsync(clock, cancellationToken);
        return await dbContext.GetShoppingListAsync(ctx, cancellationToken);
    }
}

internal static class ShoppingListQuery
{
    /// <summary>The visible list (dismissed menu items are hidden): pending first, then by name.</summary>
    public static async Task<IReadOnlyList<ShoppingItemDto>> GetShoppingListAsync(
        this IAppDbContext db,
        HouseholdContext ctx,
        CancellationToken ct
    )
    {
        var items = await db
            .ShoppingItems.Where(s => s.DismissedAt == null)
            .OrderBy(s => s.IsPurchased)
            .ThenBy(s => s.Name)
            .ToListAsync(ct);

        var productIds = items.Where(i => i.ProductId != null).Select(i => i.ProductId!.Value).Distinct().ToList();
        var statuses = await db
            .Products.Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => RestockRule.Evaluate(p, ctx.Today, ctx.ShoppingDay), ct);

        return [.. items.Select(i => i.ToDto(i.ProductId is { } id && statuses.TryGetValue(id, out var status) ? status : null))];
    }

    public static async Task<ShoppingItemDto> ToDtoAsync(
        this ShoppingItem item,
        IAppDbContext db,
        HouseholdContext ctx,
        CancellationToken ct
    )
    {
        if (item.ProductId is not { } id)
            return item.ToDto(null);
        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == id, ct);
        return item.ToDto(product is null ? null : RestockRule.Evaluate(product, ctx.Today, ctx.ShoppingDay));
    }
}
