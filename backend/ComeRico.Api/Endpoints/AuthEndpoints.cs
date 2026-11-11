using ComeRico.Api.Auth;
using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Households;
using ComeRico.Core.Features.Households.Commands;
using ComeRico.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ComeRico.Api.Endpoints;

public sealed record UpdateProfileRequest(string DisplayName);

/// <param name="ReturnTo">Frontend URL to land on once AuthKit has ended its session (must be an allowed origin).</param>
public sealed record LogoutRequest(string? ReturnTo);

/// <param name="LogoutUrl">
/// Where the browser must navigate to also end the AuthKit session — without it the next
/// "Entrar" would sign the same person back in silently. Null for sessions that predate AuthKit.
/// </param>
public sealed record LogoutResponse(string? LogoutUrl);

public sealed record CurrentUserDto(
    Guid Id,
    string DisplayName,
    string Email,
    Guid? HouseholdId,
    string? HouseholdName,
    string? InviteCode,
    string Role,
    HouseholdSettingsDto? HouseholdSettings
);

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        // The browser navigates here (it is not a fetch): we redirect to the hosted AuthKit
        // sign-in. Also registered in WorkOS as the app's sign-in endpoint, for flows that
        // start at AuthKit (an accepted invitation) and therefore come without returnTo.
        group
            .MapGet(
                "/login",
                (
                    [FromQuery] string? returnTo,
                    [FromQuery(Name = "invitation_token")] string? invitationToken,
                    HttpContext http,
                    LoginFlow loginFlow,
                    IWorkOsClient workOs,
                    IOptions<WorkOsOptions> options
                ) =>
                {
                    if (!options.Value.IsConfigured)
                        return Results.Problem(
                            "El inicio de sesión no está configurado.",
                            statusCode: StatusCodes.Status503ServiceUnavailable
                        );

                    var returnUrl = loginFlow.ResolveReturnUrl(returnTo);
                    if (returnUrl is null)
                        return Results.Problem("returnTo no es una URL permitida.", statusCode: StatusCodes.Status400BadRequest);

                    return RedirectToAuthKit(
                        http,
                        loginFlow,
                        workOs,
                        options.Value,
                        returnUrl,
                        invitationToken,
                        restarted: false
                    );
                }
            )
            .AllowAnonymous()
            .ExcludeFromDescription();

        // AuthKit sends the browser back here with the authorization code. We exchange it
        // server-side, find or create the AppUser and issue OUR session cookie (BFF): no
        // WorkOS token ever reaches the browser.
        group
            .MapGet(
                "/callback",
                async (
                    [FromQuery] string? code,
                    [FromQuery] string? state,
                    [FromQuery] string? error,
                    HttpContext http,
                    LoginFlow loginFlow,
                    IWorkOsClient workOs,
                    IOptions<WorkOsOptions> options,
                    AuthKitUserProvisioner provisioner,
                    SignInManager<AppUser> signInManager,
                    ILogger<Program> logger,
                    CancellationToken ct
                ) =>
                {
                    if (!options.Value.IsConfigured)
                        return Results.Problem(
                            "El inicio de sesión no está configurado.",
                            statusCode: StatusCodes.Status503ServiceUnavailable
                        );

                    var pending = loginFlow.Complete(http, state);
                    if (pending is null)
                    {
                        // A callback we didn't start in this browser: a flow begun at AuthKit, an
                        // expired login, or a forged link. Never redeem that code — start a login
                        // of our own instead (once: a restarted login that fails again stops here).
                        var fallback = loginFlow.ResolveReturnUrl(null);
                        var alreadyRestarted = state?.StartsWith(LoginFlow.RestartedPrefix, StringComparison.Ordinal) == true;
                        if (fallback is null || alreadyRestarted || error is not null)
                            return Results.Problem(
                                "El inicio de sesión expiró o no es válido. Vuelve a intentarlo desde la aplicación.",
                                statusCode: StatusCodes.Status400BadRequest
                            );

                        return RedirectToAuthKit(
                            http,
                            loginFlow,
                            workOs,
                            options.Value,
                            fallback,
                            invitationToken: null,
                            restarted: true
                        );
                    }

                    if (error is not null || string.IsNullOrEmpty(code))
                    {
                        logger.LogWarning("AuthKit returned an error to the callback: {Error}", error);
                        return Results.Redirect(LoginFlow.LoginErrorUrl(pending.ReturnUrl, "auth_failed"));
                    }

                    WorkOsAuthentication authentication;
                    try
                    {
                        authentication = await workOs.AuthenticateWithCodeAsync(
                            code,
                            http.Connection.RemoteIpAddress?.ToString(),
                            http.Request.Headers.UserAgent.ToString() is { Length: > 0 } userAgent ? userAgent : null,
                            ct
                        );
                    }
                    catch (Exception ex) when (ex is WorkOsApiException or HttpRequestException)
                    {
                        logger.LogWarning(ex, "AuthKit code exchange failed");
                        return Results.Redirect(LoginFlow.LoginErrorUrl(pending.ReturnUrl, "auth_failed"));
                    }

                    var result = await provisioner.FindOrCreateAsync(authentication.User, ct);
                    if (result.User is null)
                    {
                        var reason = result.Error == AuthKitSignInError.EmailNotVerified ? "email_not_verified" : "email_in_use";
                        logger.LogWarning(
                            "AuthKit login rejected for WorkOS user {WorkOsUserId}: {Reason}",
                            authentication.User.Id,
                            reason
                        );
                        return Results.Redirect(LoginFlow.LoginErrorUrl(pending.ReturnUrl, reason));
                    }

                    // Kept in the cookie's properties (not a claim) so RefreshSignInAsync — used
                    // when the household changes — carries it over.
                    var properties = new AuthenticationProperties { IsPersistent = true };
                    if (authentication.SessionId is not null)
                        properties.SetString(WorkOsSessionIdKey, authentication.SessionId);

                    await signInManager.SignInAsync(result.User, properties);
                    return Results.Redirect(pending.ReturnUrl);
                }
            )
            .AllowAnonymous()
            .ExcludeFromDescription();

        group
            .MapPost(
                "/logout",
                async Task<Ok<LogoutResponse>> (
                    [FromBody] LogoutRequest request,
                    HttpContext http,
                    SignInManager<AppUser> signInManager,
                    LoginFlow loginFlow,
                    IWorkOsClient workOs
                ) =>
                {
                    var session = await http.AuthenticateAsync(IdentityConstants.ApplicationScheme);
                    var workOsSessionId = session.Properties?.GetString(WorkOsSessionIdKey);

                    await signInManager.SignOutAsync();

                    var logoutUrl = workOsSessionId is null
                        ? null
                        : workOs.BuildLogoutUrl(
                            workOsSessionId,
                            loginFlow.IsAllowedReturnUrl(request.ReturnTo) ? request.ReturnTo : null
                        );
                    return TypedResults.Ok(new LogoutResponse(logoutUrl));
                }
            )
            .RequireAuthorization()
            .WithName("Logout")
            .WithSummary("Cierra la sesión actual y devuelve la URL para cerrar también la de AuthKit");

        group
            .MapGet(
                "/me",
                async Task<Results<Ok<CurrentUserDto>, UnauthorizedHttpResult>> (
                    UserManager<AppUser> userManager,
                    AppDbContext dbContext,
                    HttpContext httpContext,
                    CancellationToken ct
                ) =>
                {
                    var user = await userManager.GetUserAsync(httpContext.User);
                    if (user is null)
                        return TypedResults.Unauthorized();

                    var household = await FindHouseholdAsync(dbContext, user.HouseholdId, ct);
                    return TypedResults.Ok(ToDto(user, household));
                }
            )
            .RequireAuthorization()
            .WithName("GetCurrentUser")
            .WithSummary("Obtiene el usuario autenticado y su hogar");

        group
            .MapPut(
                "/me",
                async Task<Results<Ok<CurrentUserDto>, ValidationProblem, UnauthorizedHttpResult>> (
                    [FromBody] UpdateProfileRequest request,
                    UserManager<AppUser> userManager,
                    AppDbContext dbContext,
                    HttpContext httpContext,
                    CancellationToken ct
                ) =>
                {
                    var user = await userManager.GetUserAsync(httpContext.User);
                    if (user is null)
                        return TypedResults.Unauthorized();

                    if (string.IsNullOrWhiteSpace(request.DisplayName))
                        return TypedResults.ValidationProblem(
                            new Dictionary<string, string[]> { { "displayName", ["El nombre es obligatorio."] } }
                        );

                    user.DisplayName = request.DisplayName.Trim();
                    await userManager.UpdateAsync(user);

                    var household = await FindHouseholdAsync(dbContext, user.HouseholdId, ct);
                    return TypedResults.Ok(ToDto(user, household));
                }
            )
            .RequireAuthorization()
            .WithName("UpdateProfile")
            .WithSummary("Actualiza el nombre para mostrar del usuario autenticado");

        group
            .MapDelete(
                "/me",
                async Task<Results<Ok, UnauthorizedHttpResult>> (
                    UserManager<AppUser> userManager,
                    SignInManager<AppUser> signInManager,
                    AppDbContext dbContext,
                    IHouseholdMembershipService membershipService,
                    IWorkOsClient workOs,
                    HttpContext httpContext,
                    CancellationToken ct
                ) =>
                {
                    var user = await userManager.GetUserAsync(httpContext.User);
                    if (user is null)
                        return TypedResults.Unauthorized();

                    // The identity goes first: if WorkOS can't delete it, nothing is deleted here
                    // either, instead of leaving a login behind that would recreate an empty account.
                    if (user.WorkOsUserId is { } workOsUserId)
                        await workOs.DeleteUserAsync(workOsUserId, ct);

                    // Exception to the "endpoints only dispatch MediatR requests" rule: account
                    // deletion goes through ASP.NET Identity's UserManager, not a command handler,
                    // so the fallback-admin promotion has to be invoked and saved here directly.
                    await membershipService.PromoteFallbackAdminIfNeededAsync(user, ct);
                    await dbContext.SaveChangesAsync(ct);

                    await signInManager.SignOutAsync();
                    await userManager.DeleteAsync(user);

                    return TypedResults.Ok();
                }
            )
            .RequireAuthorization()
            .WithName("DeleteAccount")
            .WithSummary("Elimina la cuenta del usuario autenticado");

        return app;
    }

    private const string WorkOsSessionIdKey = "workos_sid";

    private static IResult RedirectToAuthKit(
        HttpContext http,
        LoginFlow loginFlow,
        IWorkOsClient workOs,
        WorkOsOptions options,
        string returnUrl,
        string? invitationToken,
        bool restarted
    )
    {
        var redirectUri = string.IsNullOrWhiteSpace(options.RedirectUri)
            ? $"{http.Request.Scheme}://{http.Request.Host}/api/auth/callback"
            : options.RedirectUri;

        var pending = loginFlow.Begin(http, returnUrl, restarted);
        return Results.Redirect(workOs.BuildAuthorizationUrl(redirectUri, pending.Nonce, invitationToken));
    }

    private static async Task<Household?> FindHouseholdAsync(AppDbContext dbContext, Guid? householdId, CancellationToken ct) =>
        householdId is { } id ? await dbContext.Households.FirstOrDefaultAsync(h => h.Id == id, ct) : null;

    private static CurrentUserDto ToDto(AppUser user, Household? household) =>
        new(
            user.Id,
            user.DisplayName,
            user.Email ?? string.Empty,
            user.HouseholdId,
            household?.Name,
            household?.InviteCode,
            user.Role.ToString(),
            household?.ToSettingsDto()
        );
}
