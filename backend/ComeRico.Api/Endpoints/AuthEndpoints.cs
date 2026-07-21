using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Households;
using ComeRico.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Api.Endpoints;

public sealed record UserRegisterRequest(string DisplayName, string Email, string Password);

public sealed record UserLoginRequest(string Email, string Password);

public sealed record UpdateProfileRequest(string DisplayName);

// Named distinctly from ASP.NET Identity's built-in ForgotPasswordRequest/ResetPasswordRequest
// (mapped at /api/identity/*) so the two don't collide as the same OpenAPI schema name.
public sealed record AuthForgotPasswordRequest(string Email);

public sealed record AuthResetPasswordRequest(string Email, string Token, string NewPassword);

public sealed record CurrentUserDto(
    Guid Id,
    string DisplayName,
    string Email,
    Guid? HouseholdId,
    string? HouseholdName,
    string? InviteCode,
    string Role
);

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        // Built-in Identity API endpoints under /api/auth: /api/auth/login, /api/auth/refresh,
        // /api/auth/manage/info, etc. POST /api/auth/login accepts ?useCookies=true for
        // SPA cookie auth, or returns a bearer token by default for native/mobile clients.
        app.MapGroup("/api/identity").MapIdentityApi<AppUser>();

        var group = app.MapGroup("/api/auth").WithTags("Auth");

        // Custom register: accepts DisplayName alongside email/password, which the
        // built-in MapIdentityApi /register endpoint does not support.
        group
            .MapPost(
                "/register",
                async Task<Results<Ok<CurrentUserDto>, ValidationProblem>> (
                    [FromBody] UserRegisterRequest request,
                    UserManager<AppUser> userManager,
                    SignInManager<AppUser> signInManager
                ) =>
                {
                    if (string.IsNullOrWhiteSpace(request.DisplayName))
                        return TypedResults.ValidationProblem(
                            new Dictionary<string, string[]> { { "displayName", ["El nombre es obligatorio."] } }
                        );

                    var user = new AppUser { DisplayName = request.DisplayName.Trim() };
                    await userManager.SetUserNameAsync(user, request.Email);
                    await userManager.SetEmailAsync(user, request.Email);

                    var result = await userManager.CreateAsync(user, request.Password);
                    if (!result.Succeeded)
                    {
                        var errors = result
                            .Errors.GroupBy(e => e.Code, e => e.Description)
                            .ToDictionary(g => g.Key, g => g.ToArray());
                        return TypedResults.ValidationProblem(errors);
                    }

                    await signInManager.SignInAsync(user, isPersistent: true);

                    return TypedResults.Ok(ToDto(user, null));
                }
            )
            .AllowAnonymous()
            .WithName("Register")
            .WithSummary("Registra un nuevo usuario e inicia sesión");

        group
            .MapPost(
                "/logout",
                async (SignInManager<AppUser> signInManager, [FromBody] object empty) =>
                {
                    if (empty is not null)
                    {
                        await signInManager.SignOutAsync();
                        return Results.Ok();
                    }
                    return Results.Unauthorized();
                }
            )
            .RequireAuthorization()
            .WithName("Logout")
            .WithSummary("Cierra la sesión actual");

        // No email sending capability yet: the reset token is logged server-side
        // instead of being emailed. Swap the logger call for a real mailer later.
        group
            .MapPost(
                "/forgot-password",
                async Task<Ok> (
                    [FromBody] AuthForgotPasswordRequest request,
                    UserManager<AppUser> userManager,
                    ILogger<Program> logger
                ) =>
                {
                    var user = await userManager.FindByEmailAsync(request.Email);
                    if (user is not null)
                    {
                        var token = await userManager.GeneratePasswordResetTokenAsync(user);
                        logger.LogInformation("Password reset requested for {Email}. Token: {Token}", request.Email, token);
                    }

                    // Always 200, regardless of whether the email matched a user, to
                    // avoid leaking which emails are registered.
                    return TypedResults.Ok();
                }
            )
            .AllowAnonymous()
            .WithName("ForgotPassword")
            .WithSummary("Solicita el restablecimiento de contraseña (el token se registra en el servidor)");

        group
            .MapPost(
                "/reset-password",
                async Task<Results<Ok, ValidationProblem>> (
                    [FromBody] AuthResetPasswordRequest request,
                    UserManager<AppUser> userManager
                ) =>
                {
                    var user = await userManager.FindByEmailAsync(request.Email);
                    if (user is null)
                        return TypedResults.ValidationProblem(
                            new Dictionary<string, string[]> { { "token", ["Token inválido o expirado."] } }
                        );

                    var result = await userManager.ResetPasswordAsync(user, request.Token, request.NewPassword);
                    if (!result.Succeeded)
                    {
                        var errors = result
                            .Errors.GroupBy(e => e.Code, e => e.Description)
                            .ToDictionary(g => g.Key, g => g.ToArray());
                        return TypedResults.ValidationProblem(errors);
                    }

                    return TypedResults.Ok();
                }
            )
            .AllowAnonymous()
            .WithName("ResetPassword")
            .WithSummary("Restablece la contraseña usando el token generado");

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
                    HttpContext httpContext,
                    CancellationToken ct
                ) =>
                {
                    var user = await userManager.GetUserAsync(httpContext.User);
                    if (user is null)
                        return TypedResults.Unauthorized();

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
            user.Role.ToString()
        );
}
