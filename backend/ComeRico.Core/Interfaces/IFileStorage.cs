namespace ComeRico.Core.Interfaces;

/// <summary>
/// Presigned POST target: the client submits multipart/form-data with all
/// <see cref="Fields"/> (policy + signature) followed by the file itself.
/// </summary>
public sealed record SignedUploadTarget(string Url, IReadOnlyDictionary<string, string> Fields);

public interface IFileStorage
{
    /// <summary>
    /// Creates a presigned POST so the client uploads directly to storage (no
    /// upload traffic through the API). The signed policy restricts the upload
    /// to the exact content type and the size range — storage itself rejects
    /// anything else.
    /// </summary>
    Task<SignedUploadTarget> CreateSignedUploadAsync(
        string key,
        string contentType,
        long maxSizeBytes,
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
