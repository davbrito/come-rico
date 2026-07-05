namespace ComeRico.Core.Interfaces;

public interface IFileStorage
{
    /// <summary>
    /// Creates a presigned PUT URL so the client uploads directly to storage
    /// (no upload traffic through the API). The signature pins the exact
    /// Content-Type and Content-Length headers, so storage itself rejects an
    /// upload whose type or size differs from what was validated and signed.
    /// The client must PUT with those same headers (it already knows both).
    /// </summary>
    Task<string> CreateSignedUploadAsync(
        string key,
        string contentType,
        long sizeBytes,
        TimeSpan expiresIn,
        CancellationToken ct
    );

    /// <summary>Public URL where the object will be readable after upload.</summary>
    string GetPublicUrl(string key);

    /// <summary>
    /// Copies an object from <paramref name="sourceKey"/> to
    /// <paramref name="destinationKey"/> within the same bucket.
    /// </summary>
    Task CopyAsync(string sourceKey, string destinationKey, CancellationToken ct);

    /// <summary>Deletes an object by its storage key.</summary>
    Task DeleteAsync(string key, CancellationToken ct);
}
