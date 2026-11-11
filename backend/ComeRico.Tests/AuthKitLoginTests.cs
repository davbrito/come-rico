using System.Net;
using System.Net.Http.Json;
using System.Web;
using ComeRico.Api.Auth;
using ComeRico.Core.Domain.Entities;
using ComeRico.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ComeRico.Tests;

/// <summary>
/// The whole login round trip against the real pipeline (cookies, Identity, endpoints),
/// with WorkOS replaced by a fake and the database by EF Core InMemory.
/// </summary>
public class AuthKitLoginTests
{
    // Allowed by the Development CORS policy (appsettings.Development.json).
    private const string Frontend = "http://localhost:3000";

    private static readonly WorkOsUser Ana = new("user_ana", "ana@example.com", EmailVerified: true, "Ana", "Pérez");

    [Fact]
    public async Task Login_RedirectsToAuthKit_WithTheCallbackAndAState()
    {
        await using var app = new AuthApp();
        var client = app.CreateBrowser();

        var response = await client.GetAsync(
            $"/api/auth/login?returnTo={Frontend}/dishes",
            TestContext.Current.CancellationToken
        );

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        var query = HttpUtility.ParseQueryString(response.Headers.Location!.Query);
        Assert.Equal("authkit.test", response.Headers.Location.Host);
        Assert.Equal("http://localhost/api/auth/callback", query["redirect_uri"]);
        Assert.False(string.IsNullOrEmpty(query["state"]));
    }

    [Theory]
    [InlineData("https://evil.example/")]
    [InlineData("javascript:alert(1)")]
    [InlineData("/dishes")]
    [InlineData("")]
    public async Task Login_RejectsReturnUrlsOutsideTheAllowedOrigins(string returnTo)
    {
        await using var app = new AuthApp();

        var response = await app.CreateBrowser()
            .GetAsync($"/api/auth/login?returnTo={Uri.EscapeDataString(returnTo)}", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task FirstLogin_CreatesTheUser_AndIssuesOurSession()
    {
        await using var app = new AuthApp();
        app.WorkOs.Codes["code-1"] = new WorkOsAuthentication(Ana, "session_1");
        var client = app.CreateBrowser();

        var landing = await SignInAsync(client, "code-1", $"{Frontend}/dishes");

        Assert.Equal($"{Frontend}/dishes", landing.Headers.Location!.ToString());
        var me = await client.GetFromJsonAsync<MeResponse>("/api/auth/me", TestContext.Current.CancellationToken);
        Assert.Equal("ana@example.com", me!.Email);
        Assert.Equal("Ana Pérez", me.DisplayName);
        Assert.Null(me.HouseholdId);

        var user = Assert.Single(await app.UsersAsync());
        Assert.Equal("user_ana", user.WorkOsUserId);
        Assert.True(user.EmailConfirmed);
        Assert.Null(user.PasswordHash);
    }

    [Fact]
    public async Task LaterLogins_ReuseTheSameUser_EvenIfTheEmailChangedInWorkOs()
    {
        await using var app = new AuthApp();
        app.WorkOs.Codes["code-1"] = new WorkOsAuthentication(Ana, "session_1");
        app.WorkOs.Codes["code-2"] = new WorkOsAuthentication(Ana with { Email = "ana.nueva@example.com" }, "session_2");

        await SignInAsync(app.CreateBrowser(), "code-1");
        await SignInAsync(app.CreateBrowser(), "code-2");

        var user = Assert.Single(await app.UsersAsync());
        Assert.Equal("user_ana", user.WorkOsUserId);
    }

    [Fact]
    public async Task ExistingAccount_IsLinkedByEmail_AndKeepsItsHousehold()
    {
        await using var app = new AuthApp();
        var householdId = await app.SeedLegacyUserAsync("Ana@Example.com", "Ana de antes");
        app.WorkOs.Codes["code-1"] = new WorkOsAuthentication(Ana, "session_1");
        var client = app.CreateBrowser();

        await SignInAsync(client, "code-1");

        var user = Assert.Single(await app.UsersAsync());
        Assert.Equal("user_ana", user.WorkOsUserId);
        Assert.Equal("Ana de antes", user.DisplayName);
        var me = await client.GetFromJsonAsync<MeResponse>("/api/auth/me", TestContext.Current.CancellationToken);
        Assert.Equal(householdId, me!.HouseholdId);
    }

    [Fact]
    public async Task UnverifiedEmail_NeitherLinksNorCreatesAnAccount()
    {
        await using var app = new AuthApp();
        await app.SeedLegacyUserAsync("ana@example.com", "Ana de antes");
        app.WorkOs.Codes["code-1"] = new WorkOsAuthentication(Ana with { EmailVerified = false }, "session_1");
        var client = app.CreateBrowser();

        var landing = await SignInAsync(client, "code-1");

        Assert.Equal($"{Frontend}/login?error=email_not_verified", landing.Headers.Location!.ToString());
        Assert.Null(Assert.Single(await app.UsersAsync()).WorkOsUserId);
        await AssertSignedOutAsync(client);
    }

    [Fact]
    public async Task EmailOfAnAccountLinkedToSomeoneElse_IsRejected()
    {
        await using var app = new AuthApp();
        app.WorkOs.Codes["code-1"] = new WorkOsAuthentication(Ana, "session_1");
        app.WorkOs.Codes["code-2"] = new WorkOsAuthentication(Ana with { Id = "user_other" }, "session_2");
        await SignInAsync(app.CreateBrowser(), "code-1");
        var client = app.CreateBrowser();

        var landing = await SignInAsync(client, "code-2");

        Assert.Equal($"{Frontend}/login?error=email_in_use", landing.Headers.Location!.ToString());
        Assert.Single(await app.UsersAsync());
        await AssertSignedOutAsync(client);
    }

    // What "no invitation, no sign-up" looks like from here: WorkOS refuses, so the code
    // exchange fails and nothing is created on our side.
    [Fact]
    public async Task WhenWorkOsRefusesTheCode_NoUserIsCreated()
    {
        await using var app = new AuthApp();
        var client = app.CreateBrowser();

        var landing = await SignInAsync(client, "not-a-valid-code");

        Assert.Equal($"{Frontend}/login?error=auth_failed", landing.Headers.Location!.ToString());
        Assert.Empty(await app.UsersAsync());
        await AssertSignedOutAsync(client);
    }

    [Fact]
    public async Task Callback_WithAStateThisBrowserWasNotGiven_DoesNotRedeemTheCode()
    {
        await using var app = new AuthApp();
        app.WorkOs.Codes["code-1"] = new WorkOsAuthentication(Ana, "session_1");
        var client = app.CreateBrowser();
        await client.GetAsync($"/api/auth/login?returnTo={Frontend}/", TestContext.Current.CancellationToken);

        var response = await client.GetAsync(
            "/api/auth/callback?code=code-1&state=forged",
            TestContext.Current.CancellationToken
        );

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(app.WorkOs.RedeemedCodes);
        await AssertSignedOutAsync(client);
    }

    [Fact]
    public async Task Callback_NotStartedByUs_RestartsTheLoginOnce_WhenThereIsADefaultReturnUrl()
    {
        await using var app = new AuthApp(defaultReturnUrl: $"{Frontend}/");
        app.WorkOs.Codes["code-1"] = new WorkOsAuthentication(Ana, "session_1");
        var client = app.CreateBrowser();

        // e.g. AuthKit sending the browser straight to the callback after an accepted invitation
        var restart = await client.GetAsync("/api/auth/callback?code=code-1", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Redirect, restart.StatusCode);
        Assert.Empty(app.WorkOs.RedeemedCodes);
        var state = HttpUtility.ParseQueryString(restart.Headers.Location!.Query)["state"]!;
        Assert.StartsWith(LoginFlow.RestartedPrefix, state);

        // The restarted login completes normally…
        var landing = await client.GetAsync(
            $"/api/auth/callback?code=code-1&state={Uri.EscapeDataString(state)}",
            TestContext.Current.CancellationToken
        );
        Assert.Equal($"{Frontend}/", landing.Headers.Location!.ToString());

        // …but a restarted login that comes back without its cookie is not restarted again (no loop).
        var loop = await app.CreateBrowser()
            .GetAsync(
                $"/api/auth/callback?code=code-1&state={Uri.EscapeDataString(state)}",
                TestContext.Current.CancellationToken
            );
        Assert.Equal(HttpStatusCode.BadRequest, loop.StatusCode);
    }

    [Fact]
    public async Task Logout_EndsOurSession_AndReturnsTheAuthKitLogoutUrl()
    {
        await using var app = new AuthApp();
        app.WorkOs.Codes["code-1"] = new WorkOsAuthentication(Ana, "session_1");
        var client = app.CreateBrowser();
        await SignInAsync(client, "code-1");

        var response = await client.PostAsJsonAsync(
            "/api/auth/logout",
            new { returnTo = $"{Frontend}/login" },
            TestContext.Current.CancellationToken
        );

        var body = await response.Content.ReadFromJsonAsync<LogoutBody>(TestContext.Current.CancellationToken);
        Assert.Equal(
            $"https://authkit.test/logout?session_id=session_1&return_to={Uri.EscapeDataString($"{Frontend}/login")}",
            body!.LogoutUrl
        );
        await AssertSignedOutAsync(client);
    }

    [Fact]
    public async Task HouseholdChange_KeepsTheAuthKitSessionInTheRefreshedCookie()
    {
        await using var app = new AuthApp();
        app.WorkOs.Codes["code-1"] = new WorkOsAuthentication(Ana, "session_1");
        var client = app.CreateBrowser();
        await SignInAsync(client, "code-1");

        var created = await client.PostAsJsonAsync(
            "/api/households",
            new { name = "Casa", timeZone = "UTC" },
            TestContext.Current.CancellationToken
        );
        Assert.True(created.IsSuccessStatusCode, await created.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));

        var me = await client.GetFromJsonAsync<MeResponse>("/api/auth/me", TestContext.Current.CancellationToken);
        Assert.NotNull(me!.HouseholdId);
        var logout = await client.PostAsJsonAsync("/api/auth/logout", new { }, TestContext.Current.CancellationToken);
        var body = await logout.Content.ReadFromJsonAsync<LogoutBody>(TestContext.Current.CancellationToken);
        Assert.Equal("https://authkit.test/logout?session_id=session_1", body!.LogoutUrl);
    }

    [Fact]
    public async Task DeleteAccount_AlsoDeletesTheWorkOsUser()
    {
        await using var app = new AuthApp();
        app.WorkOs.Codes["code-1"] = new WorkOsAuthentication(Ana, "session_1");
        var client = app.CreateBrowser();
        await SignInAsync(client, "code-1");

        var response = await client.DeleteAsync("/api/auth/me", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(["user_ana"], app.WorkOs.DeletedUsers);
        Assert.Empty(await app.UsersAsync());
    }

    [Theory]
    [InlineData("/api/auth/register")]
    [InlineData("/api/auth/forgot-password")]
    [InlineData("/api/auth/reset-password")]
    [InlineData("/api/identity/login")]
    [InlineData("/api/identity/register")]
    public async Task PasswordEndpoints_AreGone(string path)
    {
        await using var app = new AuthApp();

        var response = await app.CreateBrowser()
            .PostAsJsonAsync(
                path,
                new { email = "ana@example.com", password = "12345678" },
                TestContext.Current.CancellationToken
            );

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    /// <summary>Runs /login then /callback like a browser would; returns the final redirect.</summary>
    private static async Task<HttpResponseMessage> SignInAsync(HttpClient client, string code, string returnTo = $"{Frontend}/")
    {
        var ct = TestContext.Current.CancellationToken;
        var login = await client.GetAsync($"/api/auth/login?returnTo={Uri.EscapeDataString(returnTo)}", ct);
        var state = HttpUtility.ParseQueryString(login.Headers.Location!.Query)["state"]!;

        var callback = await client.GetAsync($"/api/auth/callback?code={code}&state={Uri.EscapeDataString(state)}", ct);
        Assert.Equal(HttpStatusCode.Redirect, callback.StatusCode);
        return callback;
    }

    private static async Task AssertSignedOutAsync(HttpClient client)
    {
        var me = await client.GetAsync("/api/auth/me", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    private sealed record MeResponse(Guid Id, string DisplayName, string Email, Guid? HouseholdId);

    private sealed record LogoutBody(string? LogoutUrl);

    private sealed class FakeWorkOsClient : IWorkOsClient
    {
        public Dictionary<string, WorkOsAuthentication> Codes { get; } = [];
        public List<string> RedeemedCodes { get; } = [];
        public List<string> DeletedUsers { get; } = [];

        public string BuildAuthorizationUrl(string redirectUri, string state, string? invitationToken = null) =>
            $"https://authkit.test/authorize?redirect_uri={Uri.EscapeDataString(redirectUri)}&state={Uri.EscapeDataString(state)}";

        public Task<WorkOsAuthentication> AuthenticateWithCodeAsync(
            string code,
            string? ipAddress,
            string? userAgent,
            CancellationToken ct
        )
        {
            RedeemedCodes.Add(code);
            return Codes.TryGetValue(code, out var authentication)
                ? Task.FromResult(authentication)
                : throw new WorkOsApiException(400, "invalid_grant", "The code is invalid.");
        }

        public string BuildLogoutUrl(string sessionId, string? returnTo) =>
            $"https://authkit.test/logout?session_id={sessionId}"
            + (returnTo is null ? "" : $"&return_to={Uri.EscapeDataString(returnTo)}");

        public Task DeleteUserAsync(string userId, CancellationToken ct)
        {
            DeletedUsers.Add(userId);
            return Task.CompletedTask;
        }
    }

    // Any type of the API assembly works as the entry-point marker; Program itself would
    // clash with the test runner's own generated Program.
    private sealed class AuthApp(string? defaultReturnUrl = null) : WebApplicationFactory<WorkOsOptions>
    {
        private readonly string databaseName = Guid.NewGuid().ToString();

        public FakeWorkOsClient WorkOs { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<DbContextOptions<AppDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<AppDbContext>>();
                services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(databaseName));

                services.RemoveAll<IWorkOsClient>();
                services.AddSingleton<IWorkOsClient>(WorkOs);
                services.Configure<WorkOsOptions>(options =>
                {
                    options.ApiKey = "sk_test";
                    options.ClientId = "client_test";
                    options.RedirectUri = null;
                    options.DefaultReturnUrl = defaultReturnUrl;
                });
            });
        }

        /// <summary>A client that keeps cookies but doesn't follow redirects, so each hop can be asserted.</summary>
        public HttpClient CreateBrowser() => CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        public async Task<List<AppUser>> UsersAsync()
        {
            using var scope = Services.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<AppDbContext>().Users.AsNoTracking().ToListAsync();
        }

        /// <summary>An account from before AuthKit: has a household, no WorkOS id. Returns the household id.</summary>
        public async Task<Guid> SeedLegacyUserAsync(string email, string displayName)
        {
            using var scope = Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var household = Household.Create("Casa", "UTC");
            db.Households.Add(household);
            var user = new AppUser
            {
                DisplayName = displayName,
                UserName = email,
                NormalizedUserName = email.ToUpperInvariant(),
                Email = email,
                NormalizedEmail = email.ToUpperInvariant(),
                SecurityStamp = Guid.NewGuid().ToString(),
            };
            user.JoinHousehold(household.Id, HouseholdRole.Admin);
            db.Users.Add(user);
            await db.SaveChangesAsync();
            return household.Id;
        }
    }
}
