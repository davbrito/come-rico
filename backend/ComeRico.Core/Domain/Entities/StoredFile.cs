namespace ComeRico.Core.Domain.Entities;

public enum StoredFileStatus
{
    /// <summary>Upload ticket issued; the blob may or may not exist yet.</summary>
    Pending,

    /// <summary>Referenced by an entity (e.g. a dish's ImageKey).</summary>
    Active,

    /// <summary>No longer referenced; eligible for deletion on the next sweep.</summary>
    Orphaned,
}

/// <summary>
/// Tracks every blob in object storage (dish images today, any file kind later)
/// so orphans (abandoned or replaced uploads) can be garbage-collected by a
/// scheduled sweep. Entities reference files by this row's Id, never by raw
/// storage paths. Only the key is persisted — public URLs are built at read
/// time from the configured base URL.
/// </summary>
public class StoredFile : IHasHousehold
{
    public Guid Id { get; private set; } = Guid.CreateVersion7();
    public Guid HouseholdId { get; private set; }
    public string Key { get; private set; } = string.Empty;
    public string ContentType { get; private set; } = string.Empty;
    public StoredFileStatus Status { get; private set; } = StoredFileStatus.Pending;
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;

    public Household Household { get; private set; } = null!;

    private StoredFile() { }

    public static StoredFile Create(Guid householdId, string key, string contentType) =>
        new()
        {
            HouseholdId = householdId,
            Key = key,
            ContentType = contentType,
        };

    public void Activate(string? key = null)
    {
        Status = StoredFileStatus.Active;
        if (key is not null)
            Key = key;
    }

    public void MarkOrphaned() => Status = StoredFileStatus.Orphaned;
}
