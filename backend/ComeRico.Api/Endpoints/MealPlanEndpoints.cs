using ComeRico.Core.Features.MealPlans.Commands;
using ComeRico.Core.Features.MealPlans.Queries;
using MediatR;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace ComeRico.Api.Endpoints;

public static class MealPlanEndpoints
{
    public static IEndpointRouteBuilder MapMealPlanEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/meal-plans").WithTags("MealPlans").RequireAuthorization("RequiresHousehold");

        group
            .MapGet(
                "/",
                async Task<Ok<IReadOnlyList<MealPlanDto>>> (
                    [FromQuery] DateOnly from,
                    [FromQuery] DateOnly to,
                    ISender mediator,
                    CancellationToken ct
                ) =>
                {
                    var result = await mediator.Send(new GetMealPlansQuery(from, to), ct);
                    return TypedResults.Ok(result);
                }
            )
            .WithName("GetMealPlans")
            .WithSummary("Obtiene el plan de comidas del hogar en un rango de fechas");

        group
            .MapPost(
                "/",
                async Task<Created<MealPlanDto>> (
                    [FromBody] CreateMealPlanCommand command,
                    ISender mediator,
                    LinkGenerator link,
                    CancellationToken ct
                ) =>
                {
                    var result = await mediator.Send(command, ct);
                    return TypedResults.Created(link.GetPathByName("GetMealPlan", new { id = result.Id }), result);
                }
            )
            .WithName("CreateMealPlan")
            .WithSummary("Planifica un platillo para una fecha y comida");

        group
            .MapGet(
                "/{id:guid}",
                async Task<Results<Ok<MealPlanDto>, NotFound>> (Guid id, ISender mediator, CancellationToken ct) =>
                {
                    var result = await mediator.Send(new GetMealPlanByIdQuery(id), ct);
                    return result is not null ? TypedResults.Ok(result) : TypedResults.NotFound();
                }
            )
            .WithName("GetMealPlan")
            .WithSummary("Obtiene un plan de comidas por su identificador");

        group
            .MapDelete(
                "/{id:guid}",
                async Task<Results<NoContent, NotFound>> (Guid id, ISender mediator, CancellationToken ct) =>
                {
                    var deleted = await mediator.Send(new DeleteMealPlanCommand(id), ct);
                    return deleted ? TypedResults.NoContent() : TypedResults.NotFound();
                }
            )
            .WithName("DeleteMealPlan")
            .WithSummary("Elimina una entrada del plan de comidas");

        return app;
    }
}
