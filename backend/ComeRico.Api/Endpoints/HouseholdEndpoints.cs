using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Households.Commands;
using MediatR;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace ComeRico.Api.Endpoints;

public static class HouseholdEndpoints
{
    public static IEndpointRouteBuilder MapHouseholdEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/households")
            .WithTags("Households")
            .RequireAuthorization();

        group.MapPost("/", async Task<Created<HouseholdDto>> (
            [FromBody] CreateHouseholdCommand command,
            ISender mediator,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager,
            HttpContext httpContext,
            CancellationToken ct) =>
        {
            var result = await mediator.Send(command, ct);
            await RefreshHouseholdClaimsAsync(userManager, signInManager, httpContext);
            return TypedResults.Created($"/api/households/{result.Id}", result);
        })
        .WithName("CreateHousehold")
        .WithSummary("Crea un nuevo hogar y asigna al usuario como administrador");

        group.MapPost("/join", async Task<Ok<HouseholdDto>> (
            [FromBody] JoinHouseholdCommand command,
            ISender mediator,
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager,
            HttpContext httpContext,
            CancellationToken ct) =>
        {
            var result = await mediator.Send(command, ct);
            await RefreshHouseholdClaimsAsync(userManager, signInManager, httpContext);
            return TypedResults.Ok(result);
        })
        .WithName("JoinHousehold")
        .WithSummary("Une al usuario a un hogar mediante código de invitación");

        return app;
    }

    /// <summary>
    /// Re-issues the auth cookie so it picks up the new household_id claim.
    /// Without this, the tenant query filters would keep seeing the stale (empty) claim
    /// until the user logs in again.
    /// </summary>
    private static async Task RefreshHouseholdClaimsAsync(
        UserManager<AppUser> userManager,
        SignInManager<AppUser> signInManager,
        HttpContext httpContext)
    {
        var user = await userManager.GetUserAsync(httpContext.User);
        if (user is not null)
            await signInManager.RefreshSignInAsync(user);
    }
}
