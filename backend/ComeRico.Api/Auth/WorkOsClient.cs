using System.Buffers.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using WorkOS;

namespace ComeRico.Api.Auth;

public sealed record WorkOsUser(string Id, string Email, bool EmailVerified, string? FirstName, string? LastName);

/// <param name="SessionId">The AuthKit session (<c>sid</c> claim of the access token), needed to end it on logout.</param>
public sealed record WorkOsAuthentication(WorkOsUser User, string? SessionId);

public sealed class WorkOsApiException(int statusCode, string? code, string? description)
    : Exception($"WorkOS respondió {statusCode}: {code ?? "error"} {description}".TrimEnd())
{
    public int StatusCode { get; } = statusCode;
    public string? Code { get; } = code;
}

/// <summary>The slice of the WorkOS User Management API the BFF needs.</summary>
public interface IWorkOsClient
{
    /// <summary>URL of the hosted AuthKit sign-in the browser is redirected to.</summary>
    string BuildAuthorizationUrl(string redirectUri, string state, string? invitationToken = null);

    /// <summary>Exchanges the authorization code from the callback, server-side.</summary>
    Task<WorkOsAuthentication> AuthenticateWithCodeAsync(string code, string? ipAddress, string? userAgent, CancellationToken ct);

    /// <summary>URL the browser is redirected to so AuthKit ends its own session too.</summary>
    string BuildLogoutUrl(string sessionId, string? returnTo);

    Task DeleteUserAsync(string userId, CancellationToken ct);
}

/// <summary>
/// <see cref="IWorkOsClient"/> on top of the official WorkOS .NET SDK (<c>WorkOS.net</c>).
/// The interface keeps the SDK's types out of the endpoints and lets tests fake WorkOS.
/// </summary>
public sealed class WorkOsClient(HttpClient http, IOptions<WorkOsOptions> options) : IWorkOsClient
{
    // Built on first use: the SDK rejects an empty API key, and the app must still start
    // (and answer 503 on /api/auth/login) when WorkOS isn't configured.
    private readonly Lazy<WorkOSClient> sdk = new(() =>
        new WorkOSClient(
            new WorkOSOptions
            {
                ApiKey = options.Value.ApiKey,
                ClientId = options.Value.ClientId,
                ApiBaseURL = options.Value.ApiBaseUrl.TrimEnd('/'),
                HttpClient = http,
                // A person is waiting on a redirect: fail fast instead of backing off.
                MaxRetries = 1,
            }
        )
    );

    private UserManagementService UserManagement => sdk.Value.UserManagement;

    public string BuildAuthorizationUrl(string redirectUri, string state, string? invitationToken = null) =>
        UserManagement.GetAuthorizationUrl(
            new UserManagementGetAuthorizationUrlOptions
            {
                RedirectUri = redirectUri,
                Provider = UserManagementAuthenticationProvider.Authkit,
                State = state,
                InvitationToken = string.IsNullOrWhiteSpace(invitationToken) ? null : invitationToken,
            }
        );

    public async Task<WorkOsAuthentication> AuthenticateWithCodeAsync(
        string code,
        string? ipAddress,
        string? userAgent,
        CancellationToken ct
    )
    {
        AuthenticateResponse response;
        try
        {
            response = await UserManagement.AuthenticateWithCodeAsync(
                new AuthenticateWithCodeOptions
                {
                    Code = code,
                    IpAddress = ipAddress,
                    UserAgent = userAgent,
                },
                cancellationToken: ct
            );
        }
        catch (ApiException ex)
        {
            throw Translate(ex);
        }

        if (response.User is not { Id.Length: > 0, Email.Length: > 0 } user)
            throw new WorkOsApiException(200, "invalid_response", "La respuesta no trae el usuario.");

        return new WorkOsAuthentication(
            new WorkOsUser(user.Id, user.Email, user.EmailVerified, user.FirstName, user.LastName),
            ReadSessionId(response.AccessToken)
        );
    }

    public string BuildLogoutUrl(string sessionId, string? returnTo) =>
        UserManagement.GetLogoutUrl(
            new UserManagementGetLogoutUrlOptions
            {
                SessionId = sessionId,
                ReturnTo = string.IsNullOrWhiteSpace(returnTo) ? null : returnTo,
            }
        );

    public async Task DeleteUserAsync(string userId, CancellationToken ct)
    {
        try
        {
            await UserManagement.DeleteAsync(userId, cancellationToken: ct);
        }
        catch (NotFoundException)
        {
            // Already gone in WorkOS is the outcome we wanted.
        }
        catch (ApiException ex)
        {
            throw Translate(ex);
        }
    }

    private static WorkOsApiException Translate(ApiException ex)
    {
        // The SDK reads WorkOS's own error shape ({ code, message }); the code exchange
        // answers in OAuth's ({ error, error_description }), which only the raw body has.
        var (oauthError, oauthDescription) = ReadOAuthError(ex.RawBody);
        return new WorkOsApiException((int)ex.StatusCode, ex.Code ?? oauthError, ex.ErrorMessage ?? oauthDescription);
    }

    private static (string? Error, string? Description) ReadOAuthError(string? body)
    {
        if (string.IsNullOrWhiteSpace(body))
            return (null, null);

        try
        {
            using var json = JsonDocument.Parse(body);
            if (json.RootElement.ValueKind != JsonValueKind.Object)
                return (null, null);
            return (ReadString(json.RootElement, "error"), ReadString(json.RootElement, "error_description"));
        }
        catch (JsonException)
        {
            return (null, null);
        }

        static string? ReadString(JsonElement element, string name) =>
            element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    }

    /// <summary>
    /// Reads <c>sid</c> from the access token. No signature check: the token was just
    /// handed to us by WorkOS over TLS in exchange for our secret, and it is only used
    /// to build the logout URL — never to authenticate a request.
    /// </summary>
    internal static string? ReadSessionId(string? accessToken)
    {
        var parts = accessToken?.Split('.');
        if (parts is not { Length: 3 })
            return null;

        try
        {
            using var payload = JsonDocument.Parse(Base64Url.DecodeFromChars(parts[1]));
            return payload.RootElement.TryGetProperty("sid", out var sid) && sid.ValueKind == JsonValueKind.String
                ? sid.GetString()
                : null;
        }
        catch (Exception ex) when (ex is FormatException or JsonException)
        {
            return null;
        }
    }
}
