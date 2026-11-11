using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Shopping.Commands;
using ComeRico.Core.Features.Shopping.Queries;
using MediatR;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace ComeRico.Api.Endpoints;

public static class ShoppingEndpoints
{
    public static IEndpointRouteBuilder MapShoppingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/shopping-items").WithTags("Shopping").RequireAuthorization("RequiresHousehold");

        group
            .MapGet(
                "/",
                async Task<Ok<IReadOnlyList<ShoppingItemDto>>> (ISender mediator, CancellationToken ct) =>
                {
                    var result = await mediator.Send(new GetShoppingItemsQuery(), ct);
                    return TypedResults.Ok(result);
                }
            )
            .WithName("GetShoppingItems")
            .WithSummary("Obtiene la lista de compras del hogar");

        group
            .MapPost(
                "/",
                async Task<Created<ShoppingItemDto>> (
                    [FromBody] CreateShoppingItemCommand command,
                    ISender mediator,
                    CancellationToken ct
                ) =>
                {
                    var result = await mediator.Send(command, ct);
                    return TypedResults.Created($"/api/shopping-items/{result.Id}", result);
                }
            )
            .WithName("CreateShoppingItem")
            .WithSummary("Añade un artículo manual a la lista de compras");

        group
            .MapPost(
                "/sync",
                async Task<Ok<IReadOnlyList<ShoppingItemDto>>> (ISender mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(new SyncShoppingListCommand(), ct))
            )
            .WithName("SyncShoppingList")
            .WithSummary("Actualiza la lista: productos que tocan o se acabaron + ingredientes del menú (idempotente)");

        group
            .MapPost(
                "/{id:guid}/make-recurring",
                async Task<Results<Ok<ShoppingItemDto>, NotFound>> (
                    Guid id,
                    [FromBody] MakeRecurringRequest body,
                    ISender mediator,
                    CancellationToken ct
                ) =>
                {
                    var result = await mediator.Send(
                        new MakeShoppingItemRecurringCommand(id, body.Category, body.RestockIntervalDays),
                        ct
                    );
                    return result is null ? TypedResults.NotFound() : TypedResults.Ok(result);
                }
            )
            .WithName("MakeShoppingItemRecurring")
            .WithSummary("Convierte un artículo manual en un producto del catálogo y lo vincula");

        group
            .MapPatch(
                "/{id:guid}/purchased",
                async Task<Results<Ok<ShoppingItemDto>, NotFound>> (
                    Guid id,
                    [FromBody] SetPurchasedRequest body,
                    ISender mediator,
                    CancellationToken ct
                ) =>
                {
                    var result = await mediator.Send(new SetShoppingItemPurchasedCommand(id, body.IsPurchased), ct);
                    return result is null ? TypedResults.NotFound() : TypedResults.Ok(result);
                }
            )
            .WithName("SetShoppingItemPurchased")
            .WithSummary("Marca o desmarca un artículo como comprado");

        group
            .MapDelete(
                "/{id:guid}",
                async Task<Results<NoContent, NotFound>> (Guid id, ISender mediator, CancellationToken ct) =>
                {
                    var deleted = await mediator.Send(new DeleteShoppingItemCommand(id), ct);
                    return deleted ? TypedResults.NoContent() : TypedResults.NotFound();
                }
            )
            .WithName("DeleteShoppingItem")
            .WithSummary(
                "Quita un artículo. Menú: \"ya tengo\". Producto que toca: \"saltar esta compra\". Agotado: \"sí hay\"."
            );

        return app;
    }
}

public sealed record SetPurchasedRequest(bool IsPurchased);

public sealed record MakeRecurringRequest(ProductCategory Category, int? RestockIntervalDays);
