using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Images;

public static class StoredFileExtensions
{
    /// <summary>
    /// Resolves an upload ticket id to its public URL, copying the blob from
    /// the staging prefix to its permanent location, and activates the file.
    /// Household query filters apply, so a ticket from another tenant is simply
    /// not found. Returns null when no id is given. The caller owns
    /// SaveChangesAsync.
    /// </summary>
    public static async Task<string?> ResolveUploadAsync(
        this IAppDbContext dbContext,
        IFileStorage storage,
        Guid? uploadId,
        CancellationToken ct
    )
    {
        if (uploadId is null)
            return null;

        var file =
            await dbContext.StoredFiles.FirstOrDefaultAsync(f => f.Id == uploadId, ct)
            ?? throw new InvalidOperationException("La imagen subida no existe o ya expiró. Intenta subirla de nuevo.");

        var permanentKey = file.Key.StartsWith("staging/") ? file.Key["staging/".Length..] : file.Key;
        var permanentUrl = storage.GetPublicUrl(permanentKey);

        await storage.CopyAsync(file.Key, permanentKey, ct);
        await storage.DeleteAsync(file.Key, ct);

        file.Activate(permanentKey, permanentUrl);
        return permanentUrl;
    }

    /// <summary>
    /// Marks the file serving the given public URL as orphaned so the next
    /// sweep deletes it. No-op for null or external URLs (legacy dishes with
    /// hand-typed image links). The caller owns SaveChangesAsync.
    /// </summary>
    public static async Task OrphanByUrlAsync(this DbSet<StoredFile> files, string? url, CancellationToken ct)
    {
        if (url is null)
            return;
        var file = await files.FirstOrDefaultAsync(f => f.Url == url, ct);
        file?.MarkOrphaned();
    }
}
