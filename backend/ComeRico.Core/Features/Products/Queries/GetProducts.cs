using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Products.Queries;

public sealed record GetProductsQuery : IRequest<IReadOnlyList<ProductDto>>;

public sealed record ProductDto(
    Guid Id,
    string Name,
    ProductCategory Category,
    decimal? DefaultQuantity,
    MeasurementUnit? DefaultUnit,
    int? RestockIntervalDays,
    string? PreferredBrand,
    DateOnly? LastPurchasedOn,
    decimal? LastPurchasedQuantity,
    MeasurementUnit? LastPurchasedUnit,
    DateTime? OutOfStockAt,
    DateOnly? SnoozedUntil,
    RestockStatus Status,
    DateOnly? NextDueOn,
    DateTime CreatedAt
);

public static class ProductDtoMapper
{
    public static ProductDto ToDto(this Product p, DateOnly today, DayOfWeek? shoppingDay) =>
        new(
            p.Id,
            p.Name,
            p.Category,
            p.DefaultQuantity,
            p.DefaultUnit,
            p.RestockIntervalDays,
            p.PreferredBrand,
            p.LastPurchasedOn,
            p.LastPurchasedQuantity,
            p.LastPurchasedUnit,
            p.OutOfStockAt,
            p.SnoozedUntil,
            RestockRule.Evaluate(p, today, shoppingDay),
            RestockRule.NextDueOn(p),
            p.CreatedAt
        );
}

public sealed class GetProductsQueryHandler(IAppDbContext dbContext, TimeProvider clock)
    : IRequestHandler<GetProductsQuery, IReadOnlyList<ProductDto>>
{
    public async Task<IReadOnlyList<ProductDto>> Handle(GetProductsQuery request, CancellationToken cancellationToken)
    {
        var h = await dbContext
            .Households.Where(x => x.Id == dbContext.CurrentHouseholdId)
            .Select(x => new { x.ShoppingDay, x.TimeZone })
            .FirstOrDefaultAsync(cancellationToken);
        var shoppingDay = h?.ShoppingDay;
        var today = HouseholdTime.Today(h?.TimeZone ?? "UTC", clock);

        var products = await dbContext.Products.Where(p => p.IsActive).OrderBy(p => p.Name).ToListAsync(cancellationToken);
        return [.. products.Select(p => p.ToDto(today, shoppingDay))];
    }
}
