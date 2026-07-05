using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Api.Endpoints;

public sealed record UserRegisterRequest(string DisplayName, string Email, string Password);

public sealed record UserLoginRequest(string Email, string Password);

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

                    var result = await userManager.CreateAsync(user, request.Password);
                    if (!result.Succeeded)
                    {
                        var errors = result
                            .Errors.GroupBy(e => e.Code, e => e.Description)
                            .ToDictionary(g => g.Key, g => g.ToArray());
                        return TypedResults.ValidationProblem(errors);
                    }

                    await userManager.SetUserNameAsync(user, request.Email);
                    await userManager.SetEmailAsync(user, request.Email);
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

        return app;
    }

    private static async Task<Household?> FindHouseholdAsync(
        AppDbContext dbContext,
        Guid? householdId,
        CancellationToken ct
    ) => householdId is { } id ? await dbContext.Households.FirstOrDefaultAsync(h => h.Id == id, ct) : null;

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
