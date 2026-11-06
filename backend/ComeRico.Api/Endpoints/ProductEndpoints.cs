using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Commands;
using ComeRico.Core.Features.Products.Queries;
using MediatR;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace ComeRico.Api.Endpoints;

public static class ProductEndpoints
{
    public static IEndpointRouteBuilder MapProductEndpoints(this IEndpointRouteBuilder app)
    {
        // Any household member can edit the catalog (no admin requirement).
        var group = app.MapGroup("/api/products").WithTags("Products").RequireAuthorization("RequiresHousehold");

        group
            .MapGet(
                "/",
                async Task<Ok<IReadOnlyList<ProductDto>>> (ISender mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(new GetProductsQuery(), ct))
            )
            .WithName("GetProducts")
            .WithSummary("Obtiene los productos del hogar");

        group
            .MapPost(
                "/",
                async Task<Created<ProductDto>> (
                    [FromBody] CreateProductCommand command,
                    ISender mediator,
                    CancellationToken ct
                ) =>
                {
                    var result = await mediator.Send(command, ct);
                    return TypedResults.Created($"/api/products/{result.Id}", result);
                }
            )
            .WithName("CreateProduct")
            .WithSummary("Crea un producto del hogar");

        group
            .MapPut(
                "/{id:guid}",
                async Task<Results<Ok<ProductDto>, NotFound>> (
                    Guid id,
                    [FromBody] ProductRequest body,
                    ISender mediator,
                    CancellationToken ct
                ) =>
                {
                    var result = await mediator.Send(
                        new UpdateProductCommand(
                            id,
                            body.Name,
                            body.Category,
                            body.DefaultQuantity,
                            body.DefaultUnit,
                            body.RestockIntervalDays,
                            body.PreferredBrand,
                            body.LastPurchasedOn
                        ),
                        ct
                    );
                    return result is null ? TypedResults.NotFound() : TypedResults.Ok(result);
                }
            )
            .WithName("UpdateProduct")
            .WithSummary("Actualiza un producto");

        group
            .MapDelete(
                "/{id:guid}",
                async Task<Results<NoContent, NotFound>> (Guid id, ISender mediator, CancellationToken ct) =>
                    await mediator.Send(new DeleteProductCommand(id), ct) ? TypedResults.NoContent() : TypedResults.NotFound()
            )
            .WithName("DeleteProduct")
            .WithSummary("Desactiva un producto (conserva su historial)");

        group
            .MapPost(
                "/{id:guid}/out-of-stock",
                async Task<Results<Ok<ProductDto>, NotFound>> (Guid id, ISender mediator, CancellationToken ct) =>
                {
                    var result = await mediator.Send(new MarkProductOutOfStockCommand(id), ct);
                    return result is null ? TypedResults.NotFound() : TypedResults.Ok(result);
                }
            )
            .WithName("MarkProductOutOfStock")
            .WithSummary("Se acabó: el producto aparece siempre en la lista");

        group
            .MapPost(
                "/{id:guid}/in-stock",
                async Task<Results<Ok<ProductDto>, NotFound>> (Guid id, ISender mediator, CancellationToken ct) =>
                {
                    var result = await mediator.Send(new MarkProductInStockCommand(id), ct);
                    return result is null ? TypedResults.NotFound() : TypedResults.Ok(result);
                }
            )
            .WithName("MarkProductInStock")
            .WithSummary("Sí hay: deshace un \"se acabó\"");

        group
            .MapPost(
                "/{id:guid}/snooze",
                async Task<Results<Ok<ProductDto>, NotFound>> (
                    Guid id,
                    [FromBody] SnoozeProductRequest body,
                    ISender mediator,
                    CancellationToken ct
                ) =>
                {
                    var result = await mediator.Send(new SnoozeProductCommand(id, body.Days), ct);
                    return result is null ? TypedResults.NotFound() : TypedResults.Ok(result);
                }
            )
            .WithName("SnoozeProduct")
            .WithSummary("Todavía tengo: pospone el recordatorio por tiempo");

        return app;
    }
}

public sealed record ProductRequest(
    string Name,
    ProductCategory Category,
    decimal? DefaultQuantity,
    MeasurementUnit? DefaultUnit,
    int? RestockIntervalDays,
    string? PreferredBrand,
    DateOnly? LastPurchasedOn
);

public sealed record SnoozeProductRequest(int Days);
