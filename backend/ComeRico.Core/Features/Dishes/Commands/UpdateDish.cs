using ComeRico.Core.Features.Dishes.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Dishes.Commands;

public sealed record UpdateDishCommand(Guid DishId, string Name, string? Description, string? ImageUrl) : IRequest<DishDto?>;

public sealed class UpdateDishCommandValidator : AbstractValidator<UpdateDishCommand>
{
    public UpdateDishCommandValidator()
    {
        RuleFor(x => x.DishId).NotEmpty().WithMessage("El identificador del platillo es obligatorio.");
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("El nombre del platillo es obligatorio.")
            .MaximumLength(200).WithMessage("El nombre no puede superar los 200 caracteres.");
        RuleFor(x => x.Description)
            .MaximumLength(1000).WithMessage("La descripción no puede superar los 1000 caracteres.")
            .When(x => x.Description is not null);
        RuleFor(x => x.ImageUrl)
            .MaximumLength(2048).WithMessage("La URL de imagen no puede superar los 2048 caracteres.")
            .When(x => x.ImageUrl is not null);
    }
}

public sealed class UpdateDishCommandHandler(IAppDbContext dbContext)
    : IRequestHandler<UpdateDishCommand, DishDto?>
{
    public async Task<DishDto?> Handle(UpdateDishCommand request, CancellationToken cancellationToken)
    {
        var dish = await dbContext.Dishes.FirstOrDefaultAsync(d => d.Id == request.DishId, cancellationToken);
        if (dish is null) return null;
        dish.Update(request.Name, request.Description, request.ImageUrl);
        await dbContext.SaveChangesAsync(cancellationToken);
        return new DishDto(dish.Id, dish.HouseholdId, dish.Name, dish.Description, dish.ImageUrl, dish.IsActive, dish.CreatedAt);
    }
}
