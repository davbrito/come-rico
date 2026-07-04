using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Roulette.Queries;

public sealed record GetRouletteHistoryQuery(int Page = 1, int PageSize = 20) : IRequest<IReadOnlyList<RouletteSessionDto>>;

public sealed record RouletteSessionDto(
    Guid Id,
    Guid HouseholdId,
    string Status,
    Guid? WinnerDishId,
    string? WinnerDishName,
    DateTime CreatedAt,
    DateTime? SpunAt
);

public sealed class GetRouletteHistoryQueryHandler(IAppDbContext dbContext)
    : IRequestHandler<GetRouletteHistoryQuery, IReadOnlyList<RouletteSessionDto>>
{
    public async Task<IReadOnlyList<RouletteSessionDto>> Handle(GetRouletteHistoryQuery request, CancellationToken cancellationToken)
    {
        var skip = (request.Page - 1) * request.PageSize;

        return await dbContext.RouletteSessions
            .Include(r => r.WinnerDish)
            .OrderByDescending(r => r.CreatedAt)
            .Skip(skip)
            .Take(request.PageSize)
            .Select(r => new RouletteSessionDto(
                r.Id,
                r.HouseholdId,
                r.Status.ToString(),
                r.WinnerDishId,
                r.WinnerDish != null ? r.WinnerDish.Name : null,
                r.CreatedAt,
                r.SpunAt
            ))
            .ToListAsync(cancellationToken);
    }
}
