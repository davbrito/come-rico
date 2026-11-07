using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Queries;
using ComeRico.Core.Features.Shopping;
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

        var ctx = await dbContext.GetHouseholdContextAsync(clock, cancellationToken);
        var now = clock.GetUtcNow().UtcDateTime;
        if (product.OutOfStockAt is null)
        {
            product.MarkOutOfStock(now);
            dbContext.ProductEvents.Add(
                ProductMarkedOutOfStock.Create(tenantService.HouseholdId, product.Id, currentUser.UserId, EventOrigin.Web, now)
            );
        }

        // Goes on the list right away (no-op if it's already there).
        await dbContext.SyncProductOnListAsync(product, ctx, now, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return product.ToDto(ctx);
    }
}

/// <summary>"Sí hay": undoes a mistaken "se acabó".</summary>
public sealed record MarkProductInStockCommand(Guid ProductId) : IRequest<ProductDto?>;

public sealed class MarkProductInStockCommandHandler(
    IAppDbContext dbContext,
    ITenantService tenantService,
    ICurrentUserService currentUser,
    TimeProvider clock
) : IRequestHandler<MarkProductInStockCommand, ProductDto?>
{
    public async Task<ProductDto?> Handle(MarkProductInStockCommand request, CancellationToken cancellationToken)
    {
        var product = await dbContext.FindActiveAsync(request.ProductId, cancellationToken);
        if (product is null)
            return null;

        var ctx = await dbContext.GetHouseholdContextAsync(clock, cancellationToken);
        var now = clock.GetUtcNow().UtcDateTime;
        if (product.OutOfStockAt is not null)
        {
            // Log the correction so interval learning doesn't read the earlier "se acabó" as real.
            product.MarkInStock();
            dbContext.ProductEvents.Add(
                ProductMarkedInStock.Create(tenantService.HouseholdId, product.Id, currentUser.UserId, EventOrigin.Web, now)
            );
        }

        // Leaves the list unless it's also due by time.
        await dbContext.SyncProductOnListAsync(product, ctx, now, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return product.ToDto(ctx);
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

public sealed class SnoozeProductCommandHandler(IAppDbContext dbContext, ICurrentUserService currentUser, TimeProvider clock)
    : IRequestHandler<SnoozeProductCommand, ProductDto?>
{
    public async Task<ProductDto?> Handle(SnoozeProductCommand request, CancellationToken cancellationToken)
    {
        var product = await dbContext.FindActiveAsync(request.ProductId, cancellationToken);
        if (product is null)
            return null;

        if (product.OutOfStockAt is not null)
            throw new InvalidOperationException("El producto está agotado; usa \"Sí hay\" si aún tienes.");

        var ctx = await dbContext.GetHouseholdContextAsync(clock, cancellationToken);
        var now = clock.GetUtcNow().UtcDateTime;
        dbContext.Snooze(product, ctx, request.Days, currentUser.UserId, now);
        await dbContext.SyncProductOnListAsync(product, ctx, now, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return product.ToDto(ctx);
    }
}
