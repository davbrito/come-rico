using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;

namespace ComeRico.Core.Features.Images.Commands;

/// <summary>
/// Issues an upload ticket: registers a <see cref="StoredFile"/> as
/// <see cref="StoredFileStatus.Pending"/> and returns a presigned PUT URL so
/// the client uploads directly to storage. Entities then reference the upload
/// by id (never by storage path), and consuming commands (e.g. CreateDish)
/// flip the file to Active. Abandoned tickets are swept by
/// <see cref="CleanupOrphanedFilesCommand"/>.
/// </summary>
public sealed record CreateUploadCommand(string Type, string KeyFolder, string ContentType, long SizeBytes)
    : IRequest<UploadTicketDto>;

public sealed record UploadTicketDto(Guid UploadId, string UploadUrl, IReadOnlyDictionary<string, string> Fields);

public static class UploadRules
{
    public const string ImageType = "image";

    private static readonly HashSet<string> AllowedKeyFolders = new(StringComparer.OrdinalIgnoreCase) { "dishes" };

    public static readonly UploadTypeConfig ImageConfig = new(
        AllowedContentTypes: new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["image/jpeg"] = ".jpg",
            ["image/png"] = ".png",
            ["image/webp"] = ".webp",
            ["image/avif"] = ".avif",
            ["image/gif"] = ".gif",
        },
        MaxSizeBytes: 5 * 1024 * 1024 // 5 MB
    );

    public static UploadTypeConfig GetConfig(string type) =>
        type.Equals(ImageType, StringComparison.OrdinalIgnoreCase)
            ? ImageConfig
            : throw new ArgumentException($"Tipo de upload no soportado: {type}", nameof(type));

    public static bool IsAllowedKeyFolder(string folder) => AllowedKeyFolders.Contains(folder);

    public sealed record UploadTypeConfig(
        IReadOnlyDictionary<string, string> AllowedContentTypes,
        long MaxSizeBytes,
        bool UseHouseholdFolder = true
    );
}

public sealed class CreateUploadCommandValidator : AbstractValidator<CreateUploadCommand>
{
    public CreateUploadCommandValidator()
    {
        RuleFor(x => x.Type)
            .NotEmpty()
            .WithMessage("El tipo de upload es obligatorio.")
            .Must(t => t.Equals(UploadRules.ImageType, StringComparison.OrdinalIgnoreCase))
            .WithMessage("Tipo no soportado. Usa 'image'.");

        RuleFor(x => x.KeyFolder)
            .NotEmpty()
            .WithMessage("La carpeta de destino es obligatoria.")
            .Must(UploadRules.IsAllowedKeyFolder)
            .WithMessage("Carpeta de destino no permitida.");

        When(
            x => x.Type.Equals(UploadRules.ImageType, StringComparison.OrdinalIgnoreCase),
            () =>
            {
                RuleFor(x => x.ContentType)
                    .Must(ct => UploadRules.ImageConfig.AllowedContentTypes.ContainsKey(ct))
                    .WithMessage("Formato no soportado. Usa JPG, PNG, WebP, AVIF o GIF.");
                RuleFor(x => x.SizeBytes)
                    .GreaterThan(0)
                    .WithMessage("El archivo está vacío.")
                    .LessThanOrEqualTo(UploadRules.ImageConfig.MaxSizeBytes)
                    .WithMessage("La imagen no puede superar 5 MB.");
            }
        );
    }
}

public sealed class CreateUploadCommandHandler(IAppDbContext dbContext, IFileStorage storage, ITenantService tenantService)
    : IRequestHandler<CreateUploadCommand, UploadTicketDto>
{
    private static readonly TimeSpan UploadUrlLifetime = TimeSpan.FromMinutes(15);

    public async Task<UploadTicketDto> Handle(CreateUploadCommand request, CancellationToken cancellationToken)
    {
        var config = UploadRules.GetConfig(request.Type);
        var extension = config.AllowedContentTypes[request.ContentType];
        var key = $"staging/{request.KeyFolder}/{tenantService.HouseholdId}/{Guid.NewGuid():N}{extension}";

        var file = StoredFile.Create(tenantService.HouseholdId, key, storage.GetPublicUrl(key), request.ContentType);
        dbContext.StoredFiles.Add(file);
        await dbContext.SaveChangesAsync(cancellationToken);

        var target = await storage.CreateSignedUploadAsync(
            key,
            request.ContentType,
            config.MaxSizeBytes,
            UploadUrlLifetime,
            cancellationToken
        );
        return new UploadTicketDto(file.Id, target.Url, target.Fields);
    }
}
