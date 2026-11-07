using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Commands;
using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Shopping.Queries;

public sealed record GetShoppingItemsQuery : IRequest<IReadOnlyList<ShoppingItemDto>>;

/// <param name="ProductStatus">The linked product's restock status (null without a product): an
/// <c>OutOfStock</c> one can't be snoozed, and removing it means "sí hay".</param>
/// <param name="Category">The linked product's category, to group the list while shopping.</param>
/// <param name="InCartByName">Who put it in the cart ("lo tomó Ana"), for a cart shared by the household.</param>
public sealed record ShoppingItemDto(
    Guid Id,
    string Name,
    decimal? Quantity,
    MeasurementUnit? Unit,
    ShoppingItemSource Source,
    Guid? ProductId,
    RestockStatus? ProductStatus,
    ProductCategory? Category,
    ShoppingItemStatus Status,
    DateTime? InCartAt,
    Guid? InCartByUserId,
    string? InCartByName,
    DateTime CreatedAt
);

internal sealed record ProductInfo(RestockStatus Status, ProductCategory Category);

public static class ShoppingItemDtoMapper
{
    internal static ShoppingItemDto ToDto(this ShoppingItem item, ProductInfo? product, string? inCartByName) =>
        new(
            item.Id,
            item.Name,
            item.Quantity,
            item.Unit,
            item.Source,
            item.ProductId,
            product?.Status,
            product?.Category,
            item.Status,
            item.InCartAt,
            item.InCartByUserId,
            inCartByName,
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
    /// <summary>
    /// The list while shopping: pending and in-cart items (purchased ones left it at checkout; dismissed menu
    /// items are hidden). Pending first, then by name.
    /// </summary>
    public static async Task<IReadOnlyList<ShoppingItemDto>> GetShoppingListAsync(
        this IAppDbContext db,
        HouseholdContext ctx,
        CancellationToken ct
    )
    {
        var items = await db
            .ShoppingItems.Where(s => s.Status != ShoppingItemStatus.Purchased && s.DismissedAt == null)
            .OrderBy(s => s.Status)
            .ThenBy(s => s.Name)
            .ToListAsync(ct);
        return await ToDtosAsync(db, items, ctx, ct);
    }

    public static async Task<ShoppingItemDto> ToDtoAsync(
        this ShoppingItem item,
        IAppDbContext db,
        HouseholdContext ctx,
        CancellationToken ct
    ) => (await ToDtosAsync(db, [item], ctx, ct))[0];

    private static async Task<IReadOnlyList<ShoppingItemDto>> ToDtosAsync(
        IAppDbContext db,
        List<ShoppingItem> items,
        HouseholdContext ctx,
        CancellationToken ct
    )
    {
        var productIds = items.Where(i => i.ProductId != null).Select(i => i.ProductId!.Value).Distinct().ToList();
        var products =
            productIds.Count == 0
                ? []
                : (await db.Products.Where(p => productIds.Contains(p.Id)).ToListAsync(ct)).ToDictionary(
                    p => p.Id,
                    p => new ProductInfo(RestockRule.Evaluate(p, ctx.Today, ctx.ShoppingDay), p.Category)
                );

        var userIds = items.Where(i => i.InCartByUserId != null).Select(i => i.InCartByUserId!.Value).Distinct().ToList();
        var names =
            userIds.Count == 0
                ? []
                : await db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);

        return
        [
            .. items.Select(i =>
                i.ToDto(
                    i.ProductId is { } pid ? products.GetValueOrDefault(pid) : null,
                    i.InCartByUserId is { } uid ? names.GetValueOrDefault(uid) : null
                )
            ),
        ];
    }
}
