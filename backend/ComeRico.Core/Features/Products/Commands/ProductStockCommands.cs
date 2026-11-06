using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;

namespace ComeRico.Core.Features.Products.Commands;

/// <summary>"Se acabó": the product always shows up on the list until bought or undone.</summary>
public sealed record MarkProductOutOfStockCommand(Guid ProductId) : IRequest<ProductDto?>;

public sealed class MarkProductOutOfStockCommandHandler(
    IAppDbContext dbContext,
    ITenantService tenantService,
    ICurrentUserService currentUser,
    TimeProvider clock
) : IRequestHandler<MarkProductOutOfStockCommand, ProductDto?>
{
    public async Task<ProductDto?> Handle(MarkProductOutOfStockCommand request, CancellationToken cancellationToken)
    {
        var product = await dbContext.FindActiveAsync(request.ProductId, cancellationToken);
        if (product is null)
            return null;

        if (product.OutOfStockAt is null)
        {
            var now = clock.GetUtcNow().UtcDateTime;
            product.MarkOutOfStock(now);
            dbContext.ProductEvents.Add(
                ProductMarkedOutOfStock.Create(tenantService.HouseholdId, product.Id, currentUser.UserId, EventOrigin.Web, now)
            );
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return product.ToDto(clock, await dbContext.GetShoppingDayAsync(cancellationToken));
    }
}

/// <summary>"Sí hay": undoes a mistaken "se acabó".</summary>
public sealed record MarkProductInStockCommand(Guid ProductId) : IRequest<ProductDto?>;

public sealed class MarkProductInStockCommandHandler(IAppDbContext dbContext, TimeProvider clock)
    : IRequestHandler<MarkProductInStockCommand, ProductDto?>
{
    public async Task<ProductDto?> Handle(MarkProductInStockCommand request, CancellationToken cancellationToken)
    {
        var product = await dbContext.FindActiveAsync(request.ProductId, cancellationToken);
        if (product is null)
            return null;

        product.MarkInStock();
        await dbContext.SaveChangesAsync(cancellationToken);
        return product.ToDto(clock, await dbContext.GetShoppingDayAsync(cancellationToken));
    }
}

/// <summary>"Todavía tengo": postpones the time-based reminder. Not applicable to out-of-stock products.</summary>
public sealed record SnoozeProductCommand(Guid ProductId, int Days) : IRequest<ProductDto?>;

public sealed class SnoozeProductCommandValidator : AbstractValidator<SnoozeProductCommand>
{
    public SnoozeProductCommandValidator()
    {
        RuleFor(x => x.Days).InclusiveBetween(1, 90).WithMessage("Los días a posponer deben estar entre 1 y 90.");
    }
}

public sealed class SnoozeProductCommandHandler(
    IAppDbContext dbContext,
    ITenantService tenantService,
    ICurrentUserService currentUser,
    TimeProvider clock
) : IRequestHandler<SnoozeProductCommand, ProductDto?>
{
    public async Task<ProductDto?> Handle(SnoozeProductCommand request, CancellationToken cancellationToken)
    {
        var product = await dbContext.FindActiveAsync(request.ProductId, cancellationToken);
        if (product is null)
            return null;

        if (product.OutOfStockAt is not null)
            throw new InvalidOperationException("El producto está agotado; usa \"Sí hay\" si aún tienes.");

        var shoppingDay = await dbContext.GetShoppingDayAsync(cancellationToken);
        var today = clock.Today();
        var until = today.AddDays(request.Days);

        // With a shopping day the rule compares against the next one, so a snooze must at least skip it.
        if (shoppingDay is { } day)
        {
            var afterNextShopping = RestockRule.NextShoppingDay(today, day).AddDays(1);
            if (until < afterNextShopping)
                until = afterNextShopping;
        }

        var now = clock.GetUtcNow().UtcDateTime;
        product.SnoozeUntil(until);
        dbContext.ProductEvents.Add(
            ProductSnoozed.Create(
                tenantService.HouseholdId,
                product.Id,
                currentUser.UserId,
                EventOrigin.Web,
                now,
                until.DayNumber - today.DayNumber
            )
        );
        await dbContext.SaveChangesAsync(cancellationToken);
        return product.ToDto(clock, shoppingDay);
    }
}
