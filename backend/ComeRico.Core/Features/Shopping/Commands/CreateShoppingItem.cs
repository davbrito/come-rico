using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Commands;
using ComeRico.Core.Features.Shopping.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;

namespace ComeRico.Core.Features.Shopping.Commands;

/// <param name="InCart">Bought on impulse while shopping: created straight in the cart.</param>
public sealed record CreateShoppingItemCommand(string Name, decimal? Quantity, MeasurementUnit? Unit, bool InCart = false)
    : IRequest<ShoppingItemDto>;

public sealed class CreateShoppingItemCommandValidator : AbstractValidator<CreateShoppingItemCommand>
{
    public CreateShoppingItemCommandValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty()
            .WithMessage("El nombre del artículo es obligatorio.")
            .MaximumLength(200)
            .WithMessage("El nombre no puede superar los 200 caracteres.");
        RuleFor(x => x.Quantity)
            .GreaterThan(0)
            .WithMessage("La cantidad debe ser mayor que cero.")
            .When(x => x.Quantity is not null);
        RuleFor(x => x.Unit).IsInEnum().WithMessage("La unidad de medida no es válida.").When(x => x.Unit is not null);
    }
}

public sealed class CreateShoppingItemCommandHandler(
    IAppDbContext dbContext,
    ITenantService tenantService,
    ICurrentUserService currentUser,
    TimeProvider clock
) : IRequestHandler<CreateShoppingItemCommand, ShoppingItemDto>
{
    public async Task<ShoppingItemDto> Handle(CreateShoppingItemCommand request, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var item = ShoppingItem.CreateManual(tenantService.HouseholdId, request.Name.Trim(), request.Quantity, request.Unit, now);
        if (request.InCart)
            item.PutInCart(currentUser.UserId, now);
        dbContext.ShoppingItems.Add(item);
        await dbContext.SaveChangesAsync(cancellationToken);
        var ctx = await dbContext.GetHouseholdContextAsync(clock, cancellationToken);
        return await item.ToDtoAsync(dbContext, ctx, cancellationToken);
    }
}
