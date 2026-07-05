using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using ComeRico.Core.Interfaces;
using Microsoft.Extensions.Options;

namespace ComeRico.Api.Services;

public sealed class R2Options
{
    public const string SectionName = "R2";

    /// <summary>
    /// Full S3-compatible endpoint, e.g. "https://{accountId}.r2.cloudflarestorage.com".
    /// </summary>
    public string ServiceUrl { get; set; } = string.Empty;

    public string AccessKeyId { get; set; } = string.Empty;
    public string SecretAccessKey { get; set; } = string.Empty;
    public string BucketName { get; set; } = string.Empty;

    /// <summary>
    /// Public base URL of the bucket (r2.dev subdomain or custom domain),
    /// e.g. "https://pub-xxxx.r2.dev" or "https://images.comerico.app".
    /// </summary>
    public string PublicBaseUrl { get; set; } = string.Empty;
}

/// <summary>
/// Cloudflare R2 storage via the S3-compatible API (AWSSDK.S3), per
/// https://developers.cloudflare.com/r2/examples/aws/aws-sdk-net/
/// </summary>
public sealed class R2FileStorage : IFileStorage, IDisposable
{
    private readonly AmazonS3Client _client;
    private readonly R2Options _options;

    public R2FileStorage(IOptions<R2Options> options)
    {
        _options = options.Value;
        _client = new AmazonS3Client(
            new BasicAWSCredentials(_options.AccessKeyId, _options.SecretAccessKey),
            new AmazonS3Config
            {
                ServiceURL = _options.ServiceUrl,
                // R2 does not support the SDK's default CRC-based checksums
                RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
                ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED,
            }
        );
    }

    public async Task<SignedUploadTarget> CreateSignedUploadAsync(
        string key,
        string contentType,
        long maxSizeBytes,
        TimeSpan expiresIn,
        CancellationToken ct
    )
    {
        var request = new CreatePresignedPostRequest
        {
            BucketName = _options.BucketName,
            Key = key,
            Expires = DateTime.UtcNow.Add(expiresIn),
        };
        request.Fields["Content-Type"] = contentType;
        request.Conditions.Add(S3PostCondition.ExactMatch("Content-Type", contentType));
        request.Conditions.Add(S3PostCondition.ContentLengthRange(1, maxSizeBytes));

        var response = await _client.CreatePresignedPostAsync(request);
        return new SignedUploadTarget(response.Url, response.Fields);
    }

    public string GetPublicUrl(string key) => $"{_options.PublicBaseUrl.TrimEnd('/')}/{key}";

    public Task CopyAsync(string sourceKey, string destinationKey, CancellationToken ct) =>
        _client.CopyObjectAsync(_options.BucketName, sourceKey, _options.BucketName, destinationKey, ct);

    public Task DeleteAsync(string key, CancellationToken ct) => _client.DeleteObjectAsync(_options.BucketName, key, ct);

    public void Dispose() => _client.Dispose();
}
