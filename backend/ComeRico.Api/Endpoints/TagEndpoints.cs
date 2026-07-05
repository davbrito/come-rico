using ComeRico.Core.Features.Tags.Commands;
using ComeRico.Core.Features.Tags.Queries;
using MediatR;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace ComeRico.Api.Endpoints;

public static class TagEndpoints
{
    public static IEndpointRouteBuilder MapTagEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/tags").WithTags("Tags").RequireAuthorization("RequiresHousehold");

        group
            .MapGet(
                "/",
                async Task<Ok<IReadOnlyList<TagDto>>> (ISender mediator, CancellationToken ct) =>
                {
                    var result = await mediator.Send(new GetTagsQuery(), ct);
                    return TypedResults.Ok(result);
                }
            )
            .WithName("GetTags")
            .WithSummary("Obtiene las etiquetas del hogar");

        group
            .MapPost(
                "/",
                async Task<Created<TagDto>> ([FromBody] CreateTagCommand command, ISender mediator, CancellationToken ct) =>
                {
                    var result = await mediator.Send(command, ct);
                    return TypedResults.Created($"/api/tags/{result.Id}", result);
                }
            )
            .WithName("CreateTag")
            .WithSummary("Crea una nueva etiqueta");

        group
            .MapDelete(
                "/{id:guid}",
                async Task<Results<NoContent, NotFound>> (Guid id, ISender mediator, CancellationToken ct) =>
                {
                    var deleted = await mediator.Send(new DeleteTagCommand(id), ct);
                    return deleted ? TypedResults.NoContent() : TypedResults.NotFound();
                }
            )
            .WithName("DeleteTag")
            .WithSummary("Elimina una etiqueta");

        return app;
    }
}
