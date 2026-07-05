using ComeRico.Api.Auth;
using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
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

public sealed record FieldError(string Field, string Message);
public sealed record ValidationErrorBody(IEnumerable<FieldError> Errors);
public sealed record MessageResponse(string Message);

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/register", async Task<Results<Ok<CurrentUserDto>, UnprocessableEntity<ValidationErrorBody>>> (
            [FromBody] RegisterRequest request,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager) =>
        {
            if (string.IsNullOrWhiteSpace(request.DisplayName))
                return TypedResults.UnprocessableEntity(
                    new ValidationErrorBody([new FieldError("displayName", "El nombre es obligatorio.")]));

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
                var errors = result.Errors.Select(e => new FieldError("password", e.Description));
                return TypedResults.UnprocessableEntity(new ValidationErrorBody(errors));
            }

            // BFF: the session lives in an HttpOnly cookie — no tokens ever reach the browser
            await signInManager.SignInAsync(user, isPersistent: true);
            return TypedResults.Ok(ToDto(user, null));
        })
        .AllowAnonymous()
        .WithName("Register")
        .WithSummary("Registra un nuevo usuario e inicia sesión");

        group.MapPost("/login", async Task<Results<Ok<CurrentUserDto>, JsonHttpResult<MessageResponse>>> (
            [FromBody] LoginRequest request,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager,
            AppDbContext dbContext,
            CancellationToken ct) =>
        {
            var user = await userManager.FindByEmailAsync(request.Email);
            if (user is null)
                return TypedResults.Json(
                    new MessageResponse("Correo o contraseña incorrectos."),
                    statusCode: StatusCodes.Status401Unauthorized);

            var result = await signInManager.PasswordSignInAsync(user, request.Password, isPersistent: true, lockoutOnFailure: true);
            if (!result.Succeeded)
            {
                var message = result.IsLockedOut
                    ? "La cuenta está bloqueada temporalmente. Inténtalo más tarde."
                    : "Correo o contraseña incorrectos.";
                return TypedResults.Json(new MessageResponse(message), statusCode: StatusCodes.Status401Unauthorized);
            }

            var household = await FindHouseholdAsync(dbContext, user.HouseholdId, ct);
            return TypedResults.Ok(ToDto(user, household));
        })
        .AllowAnonymous()
        .WithName("Login")
        .WithSummary("Inicia sesión con correo y contraseña");

        group.MapPost("/logout", async Task<NoContent> (SignInManager<AppUser> signInManager) =>
        {
            await signInManager.SignOutAsync();
            return TypedResults.NoContent();
        })
        .RequireAuthorization()
        .WithName("Logout")
        .WithSummary("Cierra la sesión actual");

        group.MapGet("/me", async Task<Results<Ok<CurrentUserDto>, UnauthorizedHttpResult>> (
            UserManager<AppUser> userManager,
            AppDbContext dbContext,
            HttpContext httpContext,
            CancellationToken ct) =>
        {
            var user = await userManager.GetUserAsync(httpContext.User);
            if (user is null)
                return TypedResults.Unauthorized();

            var household = await FindHouseholdAsync(dbContext, user.HouseholdId, ct);
            return TypedResults.Ok(ToDto(user, household));
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