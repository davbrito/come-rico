namespace ComeRico.Api.Auth;

/// <summary>
/// WorkOS AuthKit settings (<c>WorkOS</c> section; env vars <c>WorkOS__ApiKey</c>, …).
/// Each WorkOS environment (staging / production) has its own API key and client id.
/// </summary>
public sealed class WorkOsOptions
{
    public const string SectionName = "WorkOS";

    /// <summary>Secret API key (<c>sk_…</c>). Doubles as the OAuth client secret.</summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>Client id (<c>client_…</c>).</summary>
    public string ClientId { get; set; } = string.Empty;

    public string ApiBaseUrl { get; set; } = "https://api.workos.com";

    /// <summary>
    /// Absolute URL of <c>/api/auth/callback</c>, as registered in the WorkOS dashboard.
    /// When empty it is derived from the incoming request (scheme + host).
    /// </summary>
    public string? RedirectUri { get; set; }

    /// <summary>
    /// Frontend URL to land on when a login doesn't say where to return to — i.e. flows
    /// that start at AuthKit rather than in our app (an accepted invitation).
    /// </summary>
    public string? DefaultReturnUrl { get; set; }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey) && !string.IsNullOrWhiteSpace(ClientId);
}
