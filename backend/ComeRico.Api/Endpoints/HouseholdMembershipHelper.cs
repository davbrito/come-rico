using ComeRico.Core.Domain.Entities;
using ComeRico.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Api.Endpoints;

internal static class HouseholdMembershipHelper
{
    /// <summary>
    /// When an admin leaves or deletes their account, promotes the longest-standing
    /// remaining member to admin, but only if the household would otherwise have no admin.
    /// </summary>
    public static async Task PromoteFallbackAdminIfNeededAsync(AppDbContext dbContext, AppUser leavingUser, CancellationToken ct)
    {
        if (leavingUser.Role != HouseholdRole.Admin || leavingUser.HouseholdId is not { } householdId)
            return;

        var candidate = await dbContext
            .Users.AsTracking()
            .Where(u => u.HouseholdId == householdId && u.Id != leavingUser.Id)
            // Los Admin suben al inicio de la lista
            .OrderBy(u => u.Role == HouseholdRole.Admin ? 0 : 1)
            // Luego, desempata por antigüedad
            .ThenBy(u => u.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (candidate is null || candidate.Role == HouseholdRole.Admin)
            return;

        candidate.PromoteToAdmin();
        await dbContext.SaveChangesAsync(ct);
    }
}
