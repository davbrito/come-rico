using System.Buffers.Text;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

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
/// Plain HTTP calls to the WorkOS API (no SDK): three endpoints, all documented at
/// https://workos.com/docs/reference/authkit.
/// </summary>
public sealed class WorkOsClient(HttpClient http, IOptions<WorkOsOptions> options) : IWorkOsClient
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private WorkOsOptions Options => options.Value;
    private string BaseUrl => Options.ApiBaseUrl.TrimEnd('/');

    public string BuildAuthorizationUrl(string redirectUri, string state, string? invitationToken = null)
    {
        var query = new Dictionary<string, string?>
        {
            ["response_type"] = "code",
            ["client_id"] = Options.ClientId,
            ["redirect_uri"] = redirectUri,
            ["provider"] = "authkit",
            ["state"] = state,
        };
        if (!string.IsNullOrWhiteSpace(invitationToken))
            query["invitation_token"] = invitationToken;

        return QueryHelpers.AddQueryString($"{BaseUrl}/user_management/authorize", query);
    }

    public async Task<WorkOsAuthentication> AuthenticateWithCodeAsync(
        string code,
        string? ipAddress,
        string? userAgent,
        CancellationToken ct
    )
    {
        var body = new AuthenticateRequest(Options.ClientId, Options.ApiKey, "authorization_code", code, ipAddress, userAgent);
        using var response = await http.PostAsJsonAsync($"{BaseUrl}/user_management/authenticate", body, Json, ct);
        await EnsureSuccessAsync(response, ct);

        var result =
            await response.Content.ReadFromJsonAsync<AuthenticateResponse>(Json, ct)
            ?? throw new WorkOsApiException((int)response.StatusCode, "empty_response", null);
        if (result.User is not { Id.Length: > 0, Email.Length: > 0 } user)
            throw new WorkOsApiException((int)response.StatusCode, "invalid_response", "La respuesta no trae el usuario.");

        return new WorkOsAuthentication(
            new WorkOsUser(user.Id, user.Email, user.EmailVerified, user.FirstName, user.LastName),
            ReadSessionId(result.AccessToken)
        );
    }

    public string BuildLogoutUrl(string sessionId, string? returnTo)
    {
        var query = new Dictionary<string, string?> { ["session_id"] = sessionId };
        if (!string.IsNullOrWhiteSpace(returnTo))
            query["return_to"] = returnTo;

        return QueryHelpers.AddQueryString($"{BaseUrl}/user_management/sessions/logout", query);
    }

    public async Task DeleteUserAsync(string userId, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Delete,
            $"{BaseUrl}/user_management/users/{Uri.EscapeDataString(userId)}"
        );
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Options.ApiKey);
        using var response = await http.SendAsync(request, ct);

        // Already gone in WorkOS is the outcome we wanted.
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            return;
        await EnsureSuccessAsync(response, ct);
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode)
            return;

        ErrorResponse? error = null;
        try
        {
            error = await response.Content.ReadFromJsonAsync<ErrorResponse>(Json, ct);
        }
        catch (JsonException)
        {
            // Not a JSON error body; the status code is all we have.
        }

        throw new WorkOsApiException(
            (int)response.StatusCode,
            error?.Code ?? error?.Error,
            error?.Message ?? error?.ErrorDescription
        );
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

    private sealed record AuthenticateRequest(
        string ClientId,
        string ClientSecret,
        string GrantType,
        string Code,
        string? IpAddress,
        string? UserAgent
    );

    private sealed record AuthenticateResponse(UserResponse? User, string? AccessToken);

    private sealed record UserResponse(string Id, string Email, bool EmailVerified, string? FirstName, string? LastName);

    private sealed record ErrorResponse(string? Code, string? Message, string? Error, string? ErrorDescription);
}
