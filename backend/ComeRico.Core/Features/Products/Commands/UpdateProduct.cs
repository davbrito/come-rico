using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Queries;
using ComeRico.Core.Features.Shopping;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;

namespace ComeRico.Core.Features.Products.Commands;

/// <summary>
/// Full replacement of the editable fields. A changed <c>LastPurchasedOn</c> is recorded as a purchase;
/// a changed interval is recorded as <see cref="ProductIntervalChanged"/>.
/// </summary>
public sealed record UpdateProductCommand(
    Guid ProductId,
    string Name,
    ProductCategory Category,
    decimal? DefaultQuantity,
    MeasurementUnit? DefaultUnit,
    int? RestockIntervalDays,
    string? PreferredBrand,
    DateOnly? LastPurchasedOn
) : IRequest<ProductDto?>;

public sealed class UpdateProductCommandValidator : AbstractValidator<UpdateProductCommand>
{
    public UpdateProductCommandValidator()
    {
        RuleFor(x => x.ProductId).NotEmpty().WithMessage("El identificador del producto es obligatorio.");
        this.AddProductFieldRules(
            x => x.Name,
            x => x.Category,
            x => x.DefaultQuantity,
            x => x.DefaultUnit,
            x => x.RestockIntervalDays,
            x => x.PreferredBrand
        );
    }
}

public sealed class UpdateProductCommandHandler(
    IAppDbContext dbContext,
    ITenantService tenantService,
    ICurrentUserService currentUser,
    TimeProvider clock
) : IRequestHandler<UpdateProductCommand, ProductDto?>
{
    public async Task<ProductDto?> Handle(UpdateProductCommand request, CancellationToken cancellationToken)
    {
        var product = await dbContext.FindActiveAsync(request.ProductId, cancellationToken);
        if (product is null)
            return null;

        var ctx = await dbContext.GetHouseholdContextAsync(clock, cancellationToken);
        ProductCommandSupport.EnsureNotInFuture(request.LastPurchasedOn, ctx.Today);
        var now = clock.GetUtcNow().UtcDateTime;
        var householdId = tenantService.HouseholdId;
        var oldInterval = product.RestockIntervalDays;

        product.Update(
            request.Name.Trim(),
            request.Category,
            request.DefaultQuantity,
            request.DefaultUnit,
            request.RestockIntervalDays,
            ProductCommandSupport.NormalizeBrand(request.PreferredBrand)
        );

        if (oldInterval != request.RestockIntervalDays)
        {
            dbContext.ProductEvents.Add(
                ProductIntervalChanged.Create(
                    householdId,
                    product.Id,
                    currentUser.UserId,
                    EventOrigin.Web,
                    now,
                    oldInterval,
                    request.RestockIntervalDays
                )
            );
        }

        if (request.LastPurchasedOn is { } last && last != product.LastPurchasedOn)
        {
            // A correction of the estimate, not a real purchase: out-of-stock and snooze stay as they are.
            product.DeclareLastPurchase(last, request.DefaultQuantity ?? 1, request.DefaultUnit ?? MeasurementUnit.Piece);
            dbContext.ProductEvents.Add(
                ProductLastPurchaseDeclared.Create(householdId, product.Id, currentUser.UserId, EventOrigin.Web, now, last)
            );
        }

        await dbContext.SyncProductOnListAsync(product, ctx, now, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return product.ToDto(ctx);
    }
}
