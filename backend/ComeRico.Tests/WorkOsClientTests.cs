using System.Net;
using System.Text;
using System.Text.Json;
using ComeRico.Api.Auth;
using Microsoft.Extensions.Options;

namespace ComeRico.Tests;

public class WorkOsClientTests
{
    private static readonly WorkOsOptions Options = new()
    {
        ApiKey = "sk_test_123",
        ClientId = "client_123",
        ApiBaseUrl = "https://api.workos.test/",
    };

    [Fact]
    public void AuthorizationUrl_PointsAtAuthKit_WithOurClientAndState()
    {
        var client = CreateClient(_ => throw new InvalidOperationException("no HTTP call expected"));

        var url = new Uri(client.BuildAuthorizationUrl("https://api.example.com/api/auth/callback", "abc", "inv_token"));

        Assert.Equal("https://api.workos.test/user_management/authorize", url.GetLeftPart(UriPartial.Path));
        var query = System.Web.HttpUtility.ParseQueryString(url.Query);
        Assert.Equal("code", query["response_type"]);
        Assert.Equal("client_123", query["client_id"]);
        Assert.Equal("authkit", query["provider"]);
        Assert.Equal("https://api.example.com/api/auth/callback", query["redirect_uri"]);
        Assert.Equal("abc", query["state"]);
        Assert.Equal("inv_token", query["invitation_token"]);
    }

    [Fact]
    public async Task Authenticate_SendsTheCodeWithOurSecret_AndReadsUserAndSession()
    {
        HttpRequestMessage? sent = null;
        string? sentBody = null;
        var accessToken = $"header.{Base64Url("""{"sub":"user_01","sid":"session_01"}""")}.signature";
        var client = CreateClient(request =>
        {
            sent = request;
            sentBody = request.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
            return Json(
                HttpStatusCode.OK,
                $$"""
                {
                  "user": { "object": "user", "id": "user_01", "email": "ana@example.com", "email_verified": true,
                            "first_name": "Ana", "last_name": null, "metadata": {} },
                  "organization_id": null,
                  "access_token": "{{accessToken}}",
                  "refresh_token": "refresh"
                }
                """
            );
        });

        var result = await client.AuthenticateWithCodeAsync(
            "the-code",
            "203.0.113.7",
            "Browser/1.0",
            TestContext.Current.CancellationToken
        );

        Assert.Equal(new WorkOsUser("user_01", "ana@example.com", true, "Ana", null), result.User);
        Assert.Equal("session_01", result.SessionId);

        Assert.Equal(HttpMethod.Post, sent!.Method);
        Assert.Equal("https://api.workos.test/user_management/authenticate", sent.RequestUri!.ToString());
        using var body = JsonDocument.Parse(sentBody!);
        Assert.Equal("authorization_code", body.RootElement.GetProperty("grant_type").GetString());
        Assert.Equal("the-code", body.RootElement.GetProperty("code").GetString());
        Assert.Equal("client_123", body.RootElement.GetProperty("client_id").GetString());
        Assert.Equal("sk_test_123", body.RootElement.GetProperty("client_secret").GetString());
        Assert.Equal("203.0.113.7", body.RootElement.GetProperty("ip_address").GetString());
    }

    [Fact]
    public async Task Authenticate_ThrowsWithTheWorkOsErrorCode()
    {
        var client = CreateClient(_ =>
            Json(HttpStatusCode.BadRequest, """{"error":"invalid_grant","error_description":"The code has expired."}""")
        );

        var ex = await Assert.ThrowsAsync<WorkOsApiException>(() =>
            client.AuthenticateWithCodeAsync("old-code", null, null, TestContext.Current.CancellationToken)
        );

        Assert.Equal(400, ex.StatusCode);
        Assert.Equal("invalid_grant", ex.Code);
    }

    [Fact]
    public async Task DeleteUser_UsesTheApiKey_AndTreatsNotFoundAsDone()
    {
        HttpRequestMessage? sent = null;
        var client = CreateClient(request =>
        {
            sent = request;
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        await client.DeleteUserAsync("user_01", TestContext.Current.CancellationToken);

        Assert.Equal(HttpMethod.Delete, sent!.Method);
        Assert.Equal("https://api.workos.test/user_management/users/user_01", sent.RequestUri!.ToString());
        Assert.Equal("Bearer sk_test_123", sent.Headers.Authorization!.ToString());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-jwt")]
    [InlineData("a.%%%.c")]
    public void ReadSessionId_ReturnsNull_ForAnythingThatIsNotAJwtWithSid(string? token) =>
        Assert.Null(WorkOsClient.ReadSessionId(token));

    private static WorkOsClient CreateClient(Func<HttpRequestMessage, HttpResponseMessage> respond) =>
        new(new HttpClient(new StubHandler(respond)), Microsoft.Extensions.Options.Options.Create(Options));

    private static HttpResponseMessage Json(HttpStatusCode status, string json) =>
        new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    private static string Base64Url(string value) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(value)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(respond(request));
    }
}
