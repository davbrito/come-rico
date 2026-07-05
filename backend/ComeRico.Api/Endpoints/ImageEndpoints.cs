using ComeRico.Core.Features.Images.Commands;
using MediatR;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace ComeRico.Api.Endpoints;

public static class ImageEndpoints
{
    public static IEndpointRouteBuilder MapImageEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/images").WithTags("Images");

        group
            .MapPost(
                "/",
                async Task<Ok<UploadTicketDto>> (
                    [FromBody] CreateUploadCommand command,
                    ISender mediator,
                    CancellationToken ct
                ) =>
                {
                    var ticket = await mediator.Send(command, ct);
                    return TypedResults.Ok(ticket);
                }
            )
            .RequireAuthorization("RequiresHousehold")
            .WithName("CreateUpload")
            .WithSummary("Crea un ticket de subida: URL firmada de R2 + id del archivo");

        // Vercel Cron hits this with "Authorization: Bearer {CRON_SECRET}"; it
        // runs cross-tenant, so it authenticates with the shared secret instead
        // of a user cookie.
        group
            .MapGet(
                "/cleanup",
                async Task<Results<Ok<CleanupFilesResponse>, UnauthorizedHttpResult>> (
                    HttpRequest request,
                    IConfiguration configuration,
                    ISender mediator,
                    CancellationToken ct
                ) =>
                {
                    var secret = configuration["CRON_SECRET"];
                    if (string.IsNullOrEmpty(secret) || request.Headers.Authorization != $"Bearer {secret}")
                        return TypedResults.Unauthorized();

                    var deleted = await mediator.Send(new CleanupOrphanedFilesCommand(), ct);
                    return TypedResults.Ok(new CleanupFilesResponse(deleted));
                }
            )
            .WithName("CleanupOrphanedFiles")
            .WithSummary("Elimina archivos huérfanos de R2 (invocado por Vercel Cron)");

        return app;
    }
}

public sealed record CleanupFilesResponse(int Deleted);
