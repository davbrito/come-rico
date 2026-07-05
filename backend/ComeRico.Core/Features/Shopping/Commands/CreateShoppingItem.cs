using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Shopping.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;

namespace ComeRico.Core.Features.Shopping.Commands;

public sealed record CreateShoppingItemCommand(string Name, decimal? Amount, MeasurementUnit? Unit) : IRequest<ShoppingItemDto>;

public sealed class CreateShoppingItemCommandValidator : AbstractValidator<CreateShoppingItemCommand>
{
    public CreateShoppingItemCommandValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty()
            .WithMessage("El nombre del artículo es obligatorio.")
            .MaximumLength(200)
            .WithMessage("El nombre no puede superar los 200 caracteres.");
        RuleFor(x => x.Amount).GreaterThan(0).WithMessage("La cantidad debe ser mayor que cero.").When(x => x.Amount is not null);
        RuleFor(x => x.Unit).IsInEnum().WithMessage("La unidad de medida no es válida.").When(x => x.Unit is not null);
    }
}

public sealed class CreateShoppingItemCommandHandler(IAppDbContext dbContext, ITenantService tenantService)
    : IRequestHandler<CreateShoppingItemCommand, ShoppingItemDto>
{
    public async Task<ShoppingItemDto> Handle(CreateShoppingItemCommand request, CancellationToken cancellationToken)
    {
        var item = ShoppingItem.CreateManual(tenantService.HouseholdId, request.Name.Trim(), request.Amount, request.Unit);
        dbContext.ShoppingItems.Add(item);
        await dbContext.SaveChangesAsync(cancellationToken);
        return item.ToDto();
    }
}
