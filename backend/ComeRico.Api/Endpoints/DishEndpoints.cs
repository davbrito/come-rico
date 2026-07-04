using ComeRico.Core.Features.Dishes.Commands;
using ComeRico.Core.Features.Dishes.Queries;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ComeRico.Api.Endpoints;

public static class DishEndpoints
{
    public static IEndpointRouteBuilder MapDishEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/dishes")
            .WithTags("Dishes")
            .RequireAuthorization("RequiresHousehold");

        group.MapGet("/", async (ISender mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new GetDishesQuery(), ct);
            return Results.Ok(result);
        })
        .WithName("GetDishes")
        .WithSummary("Obtiene los platillos del hogar");

        group.MapPost("/", async ([FromBody] CreateDishCommand command, ISender mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(command, ct);
            return Results.Created($"/api/dishes/{result.Id}", result);
        })
        .WithName("CreateDish")
        .WithSummary("Crea un nuevo platillo");

        group.MapPut("/{id:guid}", async (Guid id, [FromBody] UpdateDishRequest body, ISender mediator, CancellationToken ct) =>
        {
            var command = new UpdateDishCommand(id, body.Name, body.Description, body.ImageUrl);
            var result = await mediator.Send(command, ct);
            return result is null ? Results.NotFound() : Results.Ok(result);
        })
        .WithName("UpdateDish")
        .WithSummary("Actualiza un platillo existente");

        group.MapDelete("/{id:guid}", async (Guid id, ISender mediator, CancellationToken ct) =>
        {
            var deleted = await mediator.Send(new DeleteDishCommand(id), ct);
            return deleted ? Results.NoContent() : Results.NotFound();
        })
        .WithName("DeleteDish")
        .WithSummary("Elimina (desactiva) un platillo");

        return app;
    }
}

public sealed record UpdateDishRequest(string Name, string? Description, string? ImageUrl);
