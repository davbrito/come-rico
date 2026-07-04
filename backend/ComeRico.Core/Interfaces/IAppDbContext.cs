using ComeRico.Core.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Interfaces;

public interface IAppDbContext
{
    DbSet<Household> Households { get; }
    DbSet<Dish> Dishes { get; }
    DbSet<RouletteSession> RouletteSessions { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
