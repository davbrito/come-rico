using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Images.Commands;

/// <summary>
/// Mark-and-sweep garbage collection for stored files: deletes blobs (and
/// their tracking rows) that are either explicitly orphaned or still pending
/// past the grace period (upload tickets that were never consumed).
/// Runs cross-tenant from a scheduled job, hence IgnoreQueryFilters.
/// </summary>
public sealed record CleanupOrphanedFilesCommand : IRequest<int>;

public sealed class CleanupOrphanedFilesCommandHandler(IAppDbContext dbContext, IFileStorage storage)
    : IRequestHandler<CleanupOrphanedFilesCommand, int>
{
    private static readonly TimeSpan PendingGracePeriod = TimeSpan.FromHours(2);

    public async Task<int> Handle(CleanupOrphanedFilesCommand request, CancellationToken cancellationToken)
    {
        var pendingCutoff = DateTime.UtcNow - PendingGracePeriod;
        var orphans = await dbContext
            .StoredFiles.IgnoreQueryFilters()
            .Where(f =>
                f.Status == StoredFileStatus.Orphaned || (f.Status == StoredFileStatus.Pending && f.CreatedAt < pendingCutoff)
            )
            .ToListAsync(cancellationToken);

        foreach (var file in orphans)
        {
            if (file.Status == StoredFileStatus.Orphaned)
            {
                await storage.DeleteAsync(file.Key, cancellationToken);
            }
            else
            {
                // Pending blobs live under staging/ — the R2 lifecycle policy
                // may have already deleted them; ignore delete failures.
                try
                {
                    await storage.DeleteAsync(file.Key, cancellationToken);
                }
                catch
                { /* already cleaned by lifecycle policy */
                }
            }

            dbContext.StoredFiles.Remove(file);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return orphans.Count;
    }
}
