using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Households;

public static class HouseholdDefaults
{
    /// <summary>The current household's usual number of people (falls back to <see cref="Portions.Default"/>).</summary>
    public static async Task<int> GetDefaultServingsAsync(this IAppDbContext db, CancellationToken ct)
    {
        var servings = await db
            .Households.Where(h => h.Id == db.CurrentHouseholdId)
            .Select(h => (int?)h.DefaultServings)
            .FirstOrDefaultAsync(ct);
        return servings ?? Portions.Default;
    }
}
