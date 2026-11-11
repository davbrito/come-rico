using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace ComeRico.Api.Auth;

/// <summary>
/// State of a login in flight, between <c>/api/auth/login</c> and <c>/api/auth/callback</c>.
/// It travels in a short-lived, encrypted, HttpOnly cookie, and its nonce is the OAuth
/// <c>state</c>: the callback only accepts a code when both match, so a code obtained in
/// another browser can't be planted in this one (login CSRF).
/// </summary>
public sealed record PendingLogin(string Nonce, string ReturnUrl);

public sealed class LoginFlow(
    IDataProtectionProvider dataProtection,
    IOptions<WorkOsOptions> workOsOptions,
    IOptions<CorsOptions> corsOptions,
    IHostEnvironment environment
)
{
    /// <summary>Marks the state of a login we restarted ourselves, so it is never restarted twice (no redirect loops).</summary>
    public const string RestartedPrefix = "r.";

    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(15);

    private readonly ITimeLimitedDataProtector protector = dataProtection
        .CreateProtector("ComeRico.Auth.PendingLogin")
        .ToTimeLimitedDataProtector();

    // Same naming rule as the session cookie: __Host- requires Secure, which plain-HTTP local dev can't satisfy.
    private string CookieName => environment.IsDevelopment() ? "comerico.login" : "__Host-comerico.login";

    public PendingLogin Begin(HttpContext http, string returnUrl, bool restarted)
    {
        var nonce =
            (restarted ? RestartedPrefix : string.Empty) + WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var pending = new PendingLogin(nonce, returnUrl);

        http.Response.Cookies.Append(
            CookieName,
            protector.Protect(JsonSerializer.Serialize(pending), Lifetime),
            CookieOptions(http, Lifetime)
        );
        return pending;
    }

    /// <summary>Reads and clears the pending login; null unless <paramref name="state"/> is the one we issued to this browser.</summary>
    public PendingLogin? Complete(HttpContext http, string? state)
    {
        if (!http.Request.Cookies.TryGetValue(CookieName, out var cookie))
            return null;
        http.Response.Cookies.Delete(CookieName, CookieOptions(http, null));

        PendingLogin? pending;
        try
        {
            pending = JsonSerializer.Deserialize<PendingLogin>(protector.Unprotect(cookie));
        }
        catch (Exception ex) when (ex is CryptographicException or JsonException)
        {
            return null;
        }

        if (pending is null || string.IsNullOrEmpty(state))
            return null;

        var matches = CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(pending.Nonce),
            Encoding.UTF8.GetBytes(state)
        );
        return matches ? pending : null;
    }

    /// <summary>
    /// Where the browser may be sent after login/logout: only an origin the API already
    /// trusts for credentialed requests (the CORS allowlist, wildcards included) — never an
    /// arbitrary URL. Falls back to the configured default; null when there is neither.
    /// </summary>
    public string? ResolveReturnUrl(string? requested)
    {
        if (IsAllowedReturnUrl(requested))
            return requested;

        var fallback = workOsOptions.Value.DefaultReturnUrl;
        return Uri.TryCreate(fallback, UriKind.Absolute, out _) ? fallback : null;
    }

    public bool IsAllowedReturnUrl(string? url)
    {
        if (
            !Uri.TryCreate(url, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp)
        )
            return false;

        var policy = corsOptions.Value.GetPolicy(corsOptions.Value.DefaultPolicyName);
        return policy is not null && !policy.AllowAnyOrigin && policy.IsOriginAllowed(uri.GetLeftPart(UriPartial.Authority));
    }

    /// <summary>The frontend's login page (same origin as <paramref name="returnUrl"/>) showing why the login failed.</summary>
    public static string LoginErrorUrl(string returnUrl, string error) =>
        QueryHelpers.AddQueryString(new Uri(new Uri(returnUrl), "/login").ToString(), "error", error);

    private CookieOptions CookieOptions(HttpContext http, TimeSpan? maxAge) =>
        new()
        {
            HttpOnly = true,
            // Lax: the cookie must come back on the top-level redirect from AuthKit to the callback.
            SameSite = SameSiteMode.Lax,
            Secure = !environment.IsDevelopment() || http.Request.IsHttps,
            Path = "/",
            MaxAge = maxAge,
            IsEssential = true,
        };
}
