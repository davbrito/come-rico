using ComeRico.Api.Auth;
using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Api.Endpoints;

public sealed record RegisterRequest(string DisplayName, string Email, string Password);
public sealed record LoginRequest(string Email, string Password);

public sealed record CurrentUserDto(
    Guid Id,
    string DisplayName,
    string Email,
    Guid? HouseholdId,
    string? HouseholdName,
    string? InviteCode,
    string Role);

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/register", async (
            [FromBody] RegisterRequest request,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager) =>
        {
            if (string.IsNullOrWhiteSpace(request.DisplayName))
                return Results.UnprocessableEntity(new { errors = new[] { new { field = "displayName", message = "El nombre es obligatorio." } } });

            var user = new AppUser
            {
                Id = Guid.NewGuid(),
                UserName = request.Email,
                Email = request.Email,
                DisplayName = request.DisplayName.Trim(),
            };

            var result = await userManager.CreateAsync(user, request.Password);
            if (!result.Succeeded)
            {
                var errors = result.Errors.Select(e => new { field = "password", message = e.Description });
                return Results.UnprocessableEntity(new { errors });
            }

            // BFF: the session lives in an HttpOnly cookie — no tokens ever reach the browser
            await signInManager.SignInAsync(user, isPersistent: true);
            return Results.Ok(ToDto(user, null));
        })
        .AllowAnonymous()
        .WithName("Register")
        .WithSummary("Registra un nuevo usuario e inicia sesión");

        group.MapPost("/login", async (
            [FromBody] LoginRequest request,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager,
            AppDbContext dbContext,
            CancellationToken ct) =>
        {
            var user = await userManager.FindByEmailAsync(request.Email);
            if (user is null)
                return Results.Json(new { message = "Correo o contraseña incorrectos." }, statusCode: StatusCodes.Status401Unauthorized);

            var result = await signInManager.PasswordSignInAsync(user, request.Password, isPersistent: true, lockoutOnFailure: true);
            if (!result.Succeeded)
            {
                var message = result.IsLockedOut
                    ? "La cuenta está bloqueada temporalmente. Inténtalo más tarde."
                    : "Correo o contraseña incorrectos.";
                return Results.Json(new { message }, statusCode: StatusCodes.Status401Unauthorized);
            }

            var household = await FindHouseholdAsync(dbContext, user.HouseholdId, ct);
            return Results.Ok(ToDto(user, household));
        })
        .AllowAnonymous()
        .WithName("Login")
        .WithSummary("Inicia sesión con correo y contraseña");

        group.MapPost("/logout", async (SignInManager<AppUser> signInManager) =>
        {
            await signInManager.SignOutAsync();
            return Results.NoContent();
        })
        .RequireAuthorization()
        .WithName("Logout")
        .WithSummary("Cierra la sesión actual");

        group.MapGet("/me", async (
            UserManager<AppUser> userManager,
            AppDbContext dbContext,
            HttpContext httpContext,
            CancellationToken ct) =>
        {
            var user = await userManager.GetUserAsync(httpContext.User);
            if (user is null)
                return Results.Unauthorized();

            var household = await FindHouseholdAsync(dbContext, user.HouseholdId, ct);
            return Results.Ok(ToDto(user, household));
        })
        .RequireAuthorization()
        .WithName("GetCurrentUser")
        .WithSummary("Obtiene el usuario autenticado y su hogar");

        return app;
    }

    private static async Task<Household?> FindHouseholdAsync(AppDbContext dbContext, Guid? householdId, CancellationToken ct) =>
        householdId is { } id
            ? await dbContext.Households.FirstOrDefaultAsync(h => h.Id == id, ct)
            : null;

    private static CurrentUserDto ToDto(AppUser user, Household? household) => new(
        user.Id,
        user.DisplayName,
        user.Email ?? string.Empty,
        user.HouseholdId,
        household?.Name,
        household?.InviteCode,
        user.Role.ToString());
}
