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
                "/{id:guid}/cart",
                async Task<Results<Ok<ShoppingItemDto>, NotFound>> (
                    Guid id,
                    [FromBody] SetInCartRequest body,
                    ISender mediator,
                    CancellationToken ct
                ) =>
                {
                    var result = await mediator.Send(new SetShoppingItemInCartCommand(id, body.InCart), ct);
                    return result is null ? TypedResults.NotFound() : TypedResults.Ok(result);
                }
            )
            .WithName("SetShoppingItemInCart")
            .WithSummary("Echa al carrito o saca del carrito (no cuenta como comprado hasta terminar la compra)");

        group
            .MapPatch(
                "/{id:guid}/quantity",
                async Task<Results<Ok<ShoppingItemDto>, NotFound>> (
                    Guid id,
                    [FromBody] SetQuantityRequest body,
                    ISender mediator,
                    CancellationToken ct
                ) =>
                {
                    var result = await mediator.Send(new SetShoppingItemQuantityCommand(id, body.Quantity), ct);
                    return result is null ? TypedResults.NotFound() : TypedResults.Ok(result);
                }
            )
            .WithName("SetShoppingItemQuantity")
            .WithSummary("Ajusta la cantidad de un artículo de la lista o del carrito");

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

        var trips = app.MapGroup("/api/shopping-trips").WithTags("Shopping").RequireAuthorization("RequiresHousehold");

        trips
            .MapPost(
                "/",
                async Task<Ok<ShoppingTripDto>> ([FromBody] CheckoutCommand command, ISender mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(command, ct))
            )
            .WithName("Checkout")
            .WithSummary("Terminar compra: confirma todo lo que está en el carrito (tienda y total opcionales)");

        trips
            .MapGet(
                "/latest",
                async Task<Results<Ok<ShoppingTripDto>, NoContent>> (ISender mediator, CancellationToken ct) =>
                    await mediator.Send(new GetLatestShoppingTripQuery(), ct) is { } trip
                        ? TypedResults.Ok(trip)
                        : TypedResults.NoContent()
            )
            .WithName("GetLatestShoppingTrip")
            .WithSummary("La última compra que todavía se puede deshacer");

        trips
            .MapPost(
                "/{id:guid}/undo",
                async Task<Results<Ok<ShoppingTripDto>, NotFound>> (Guid id, ISender mediator, CancellationToken ct) =>
                    await mediator.Send(new UndoCheckoutCommand(id), ct) is { } trip
                        ? TypedResults.Ok(trip)
                        : TypedResults.NotFound()
            )
            .WithName("UndoCheckout")
            .WithSummary("Deshace la última compra: sus artículos vuelven al carrito y se revierten las compras");

        return app;
    }
}

public sealed record SetInCartRequest(bool InCart);

public sealed record SetQuantityRequest(decimal? Quantity);

public sealed record MakeRecurringRequest(ProductCategory Category, int? RestockIntervalDays);
