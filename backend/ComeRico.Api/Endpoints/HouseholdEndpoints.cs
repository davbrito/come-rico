using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Households.Commands;
using ComeRico.Core.Interfaces;
using ComeRico.Core.Persistence;
using MediatR;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Api.Endpoints;

public sealed record HouseholdMemberDto(Guid Id, string DisplayName, string Role, DateTime CreatedAt);

public sealed record RenameHouseholdRequest(string Name);

public static class HouseholdEndpoints
{
    public static IEndpointRouteBuilder MapHouseholdEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/households").WithTags("Households").RequireAuthorization();

        group
            .MapPost(
                "/",
                async Task<Created<HouseholdDto>> (
                    [FromBody] CreateHouseholdCommand command,
                    ISender mediator,
                    UserManager<AppUser> userManager,
                    SignInManager<AppUser> signInManager,
                    HttpContext httpContext,
                    CancellationToken ct
                ) =>
                {
                    var result = await mediator.Send(command, ct);
                    await RefreshHouseholdClaimsAsync(userManager, signInManager, httpContext);
                    return TypedResults.Created($"/api/households/{result.Id}", result);
                }
            )
            .WithName("CreateHousehold")
            .WithSummary("Crea un nuevo hogar y asigna al usuario como administrador");

        group
            .MapPost(
                "/join",
                async Task<Ok<HouseholdDto>> (
                    [FromBody] JoinHouseholdCommand command,
                    ISender mediator,
                    UserManager<AppUser> userManager,
                    SignInManager<AppUser> signInManager,
                    HttpContext httpContext,
                    CancellationToken ct
                ) =>
                {
                    var result = await mediator.Send(command, ct);
                    await RefreshHouseholdClaimsAsync(userManager, signInManager, httpContext);
                    return TypedResults.Ok(result);
                }
            )
            .WithName("JoinHousehold")
            .WithSummary("Une al usuario a un hogar mediante código de invitación");

        group
            .MapPatch(
                "/name",
                async Task<Results<Ok, NotFound, UnauthorizedHttpResult>> (
                    [FromBody] RenameHouseholdRequest request,
                    ITenantService tenantService,
                    ICurrentUserService currentUserService,
                    AppDbContext dbContext,
                    CancellationToken ct
                ) =>
                {
                    var household = await dbContext.Households.FirstOrDefaultAsync(h => h.Id == tenantService.HouseholdId, ct);

                    if (household is null)
                        return TypedResults.NotFound();

                    var currentUser = await dbContext.Users.FirstOrDefaultAsync(u => u.Id == currentUserService.UserId, ct);

                    if (currentUser is null || currentUser.Role != HouseholdRole.Admin)
                        return TypedResults.Unauthorized();

                    household.Rename(request.Name);
                    await dbContext.SaveChangesAsync(ct);

                    return TypedResults.Ok();
                }
            )
            .RequireAuthorization("RequiresHousehold")
            .WithName("RenameHousehold")
            .WithSummary("Cambia el nombre del hogar (solo admin)");

        group
            .MapPost(
                "/leave",
                async Task<Results<Ok, UnauthorizedHttpResult>> (
                    ICurrentUserService currentUserService,
                    UserManager<AppUser> userManager,
                    SignInManager<AppUser> signInManager,
                    AppDbContext dbContext,
                    HttpContext httpContext,
                    CancellationToken ct
                ) =>
                {
                    var currentUser = await dbContext.Users.FirstOrDefaultAsync(u => u.Id == currentUserService.UserId, ct);
                    if (currentUser is null)
                        return TypedResults.Unauthorized();

                    await HouseholdMembershipHelper.PromoteFallbackAdminIfNeededAsync(dbContext, currentUser, ct);

                    currentUser.LeaveHousehold();
                    await dbContext.SaveChangesAsync(ct);
                    await RefreshHouseholdClaimsAsync(userManager, signInManager, httpContext);

                    return TypedResults.Ok();
                }
            )
            .RequireAuthorization("RequiresHousehold")
            .WithName("LeaveHousehold")
            .WithSummary("Abandona el hogar actual");

        group
            .MapGet(
                "/members",
                async Task<Ok<List<HouseholdMemberDto>>> (
                    ITenantService tenantService,
                    AppDbContext dbContext,
                    CancellationToken ct
                ) =>
                {
                    var members = await dbContext
                        .Users.AsNoTracking()
                        .Where(u => u.HouseholdId == tenantService.HouseholdId)
                        .OrderBy(u => u.CreatedAt)
                        .Select(u => new HouseholdMemberDto(u.Id, u.DisplayName, u.Role.ToString(), u.CreatedAt))
                        .ToListAsync(ct);

                    return TypedResults.Ok(members);
                }
            )
            .RequireAuthorization("RequiresHousehold")
            .WithName("GetHouseholdMembers")
            .WithSummary("Obtiene los miembros del hogar del usuario autenticado");

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
        HttpContext httpContext
    )
    {
        var user = await userManager.GetUserAsync(httpContext.User);
        if (user is not null)
            await signInManager.RefreshSignInAsync(user);
    }
}
