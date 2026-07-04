using ComeRico.Core.Features.Households.Commands;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ComeRico.Api.Endpoints;

public static class HouseholdEndpoints
{
    public static IEndpointRouteBuilder MapHouseholdEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/households").WithTags("Households");

        group.MapPost("/", async ([FromBody] CreateHouseholdCommand command, ISender mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(command, ct);
            return Results.Created($"/api/households/{result.Id}", result);
        })
        .WithName("CreateHousehold")
        .WithSummary("Crea un nuevo hogar");

        return app;
    }
}
