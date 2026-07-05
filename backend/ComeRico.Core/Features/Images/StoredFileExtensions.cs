using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Images;

public static class StoredFileExtensions
{
    /// <summary>
    /// Resolves an upload ticket id to its permanent storage key, copying the
    /// blob from the staging prefix to its permanent location, and activates
    /// the file. Household query filters apply, so a ticket from another tenant
    /// is simply not found. Returns null when no id is given. The caller owns
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

        await storage.CopyAsync(file.Key, permanentKey, ct);
        await storage.DeleteAsync(file.Key, ct);

        file.Activate(permanentKey);
        return permanentKey;
    }

    /// <summary>
    /// Marks the file at the given storage key as orphaned so the next sweep
    /// deletes it. No-op for null or external URLs (legacy dishes with
    /// hand-typed image links never match a key). The caller owns
    /// SaveChangesAsync.
    /// </summary>
    public static async Task OrphanByKeyAsync(this DbSet<StoredFile> files, string? key, CancellationToken ct)
    {
        if (key is null)
            return;
        var file = await files.FirstOrDefaultAsync(f => f.Key == key, ct);
        file?.MarkOrphaned();
    }

    /// <summary>
    /// Builds the public URL for a stored image key. Absolute URLs (legacy
    /// dishes with hand-typed image links) pass through unchanged.
    /// </summary>
    public static string? ResolveImageUrl(this IFileStorage storage, string? imageKey) =>
        imageKey is null ? null
        : imageKey.StartsWith("http") ? imageKey
        : storage.GetPublicUrl(imageKey);
}
