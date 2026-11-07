using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Shopping.Queries;

/// <param name="ItemCount">Items confirmed in this trip.</param>
public sealed record ShoppingTripDto(
    Guid Id,
    DateTime CompletedAt,
    string? Store,
    Money? TotalPaid,
    int ItemCount,
    DateTime? RevertedAt
);

public static class ShoppingTripDtoMapper
{
    public static ShoppingTripDto ToDto(this ShoppingTrip trip, int itemCount) =>
        new(trip.Id, trip.CompletedAt, trip.Store, trip.TotalPaid, itemCount, trip.RevertedAt);
}

/// <summary>The household's latest trip that can still be undone (null if there is none).</summary>
public sealed record GetLatestShoppingTripQuery : IRequest<ShoppingTripDto?>;

public sealed class GetLatestShoppingTripQueryHandler(IAppDbContext dbContext)
    : IRequestHandler<GetLatestShoppingTripQuery, ShoppingTripDto?>
{
    public async Task<ShoppingTripDto?> Handle(GetLatestShoppingTripQuery request, CancellationToken cancellationToken)
    {
        var trip = await dbContext
            .ShoppingTrips.Where(t => t.RevertedAt == null)
            .OrderByDescending(t => t.CompletedAt)
            .FirstOrDefaultAsync(cancellationToken);
        if (trip is null)
            return null;

        var count = await dbContext.ShoppingItems.CountAsync(s => s.ShoppingTripId == trip.Id, cancellationToken);
        return trip.ToDto(count);
    }
}
