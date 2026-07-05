using ComeRico.Core.Features.Dishes.Queries;
using ComeRico.Core.Features.Images;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Dishes.Commands;

/// <summary>
/// ImageUploadId null keeps the current image; set RemoveImage to drop it.
/// </summary>
public sealed record UpdateDishCommand(Guid DishId, string Name, string? Description, Guid? ImageUploadId, bool RemoveImage)
    : IRequest<DishDto?>;

public sealed class UpdateDishCommandValidator : AbstractValidator<UpdateDishCommand>
{
    public UpdateDishCommandValidator()
    {
        RuleFor(x => x.DishId).NotEmpty().WithMessage("El identificador del platillo es obligatorio.");
        RuleFor(x => x.Name)
            .NotEmpty()
            .WithMessage("El nombre del platillo es obligatorio.")
            .MaximumLength(200)
            .WithMessage("El nombre no puede superar los 200 caracteres.");
        RuleFor(x => x.Description)
            .MaximumLength(1000)
            .WithMessage("La descripción no puede superar los 1000 caracteres.")
            .When(x => x.Description is not null);
    }
}

public sealed class UpdateDishCommandHandler(IAppDbContext dbContext, IFileStorage storage)
    : IRequestHandler<UpdateDishCommand, DishDto?>
{
    public async Task<DishDto?> Handle(UpdateDishCommand request, CancellationToken cancellationToken)
    {
        var dish = await dbContext
            .Dishes.Include(d => d.Ingredients)
            .Include(d => d.Tags)
            .FirstOrDefaultAsync(d => d.Id == request.DishId, cancellationToken);
        if (dish is null)
            return null;

        var imageUrl = dish.ImageUrl;
        if (request.ImageUploadId is not null)
        {
            imageUrl = await dbContext.ResolveUploadAsync(storage, request.ImageUploadId, cancellationToken);
        }
        else if (request.RemoveImage)
        {
            imageUrl = null;
        }

        if (imageUrl != dish.ImageUrl)
            await dbContext.StoredFiles.OrphanByUrlAsync(dish.ImageUrl, cancellationToken);

        dish.Update(request.Name, request.Description, imageUrl);
        await dbContext.SaveChangesAsync(cancellationToken);
        return dish.ToDto();
    }
}
