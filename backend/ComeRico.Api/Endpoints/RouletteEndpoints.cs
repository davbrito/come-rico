using ComeRico.Api.Hubs;
using ComeRico.Core.Features.Roulette.Commands;
using ComeRico.Core.Features.Roulette.Queries;
using MediatR;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace ComeRico.Api.Endpoints;

public static class RouletteEndpoints
{
    public static IEndpointRouteBuilder MapRouletteEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/roulette").WithTags("Roulette").RequireAuthorization("RequiresHousehold");

        group
            .MapPost(
                "/spin",
                async Task<Ok<SpinRouletteResult>> (
                    ISender mediator,
                    IHubContext<RouletteHub> hubContext,
                    HttpContext httpContext,
                    CancellationToken ct
                ) =>
                {
                    var result = await mediator.Send(new SpinRouletteCommand(), ct);

                    // Broadcast result to all members of the household group (decoupled from business logic)
                    var householdGroup = $"household-{result.HouseholdId}";
                    await hubContext.Clients.Group(householdGroup).SendAsync("RouletteSpun", result, ct);

                    return TypedResults.Ok(result);
                }
            )
            .WithName("SpinRoulette")
            .WithSummary("Gira la ruleta y retorna el platillo ganador");

        group
            .MapGet(
                "/history",
                async Task<Ok<IReadOnlyList<RouletteSessionDto>>> (
                    [FromQuery] int page,
                    [FromQuery] int pageSize,
                    ISender mediator,
                    CancellationToken ct
                ) =>
                {
                    var result = await mediator.Send(
                        new GetRouletteHistoryQuery(page <= 0 ? 1 : page, pageSize <= 0 ? 20 : pageSize),
                        ct
                    );
                    return TypedResults.Ok(result);
                }
            )
            .WithName("GetRouletteHistory")
            .WithSummary("Obtiene el historial de giros de la ruleta");

        return app;
    }
}
