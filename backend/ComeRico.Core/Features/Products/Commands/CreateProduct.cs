using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Products.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;

namespace ComeRico.Core.Features.Products.Commands;

/// <param name="LastPurchasedOn">"¿Cuándo lo compraste por última vez?"; null = unknown, counts as overdue.</param>
public sealed record CreateProductCommand(
    string Name,
    ProductCategory Category,
    decimal? DefaultQuantity,
    MeasurementUnit? DefaultUnit,
    int? RestockIntervalDays,
    string? PreferredBrand,
    DateOnly? LastPurchasedOn
) : IRequest<ProductDto>;

public sealed class CreateProductCommandValidator : AbstractValidator<CreateProductCommand>
{
    public CreateProductCommandValidator()
    {
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

public sealed class CreateProductCommandHandler(
    IAppDbContext dbContext,
    ITenantService tenantService,
    ICurrentUserService currentUser,
    TimeProvider clock
) : IRequestHandler<CreateProductCommand, ProductDto>
{
    public async Task<ProductDto> Handle(CreateProductCommand request, CancellationToken cancellationToken)
    {
        var ctx = await dbContext.GetHouseholdContextAsync(clock, cancellationToken);
        ProductCommandSupport.EnsureNotInFuture(request.LastPurchasedOn, ctx.Today);
        var now = clock.GetUtcNow().UtcDateTime;
        var householdId = tenantService.HouseholdId;

        var product = Product.Create(
            householdId,
            request.Name.Trim(),
            request.Category,
            request.DefaultQuantity,
            request.DefaultUnit,
            request.RestockIntervalDays,
            ProductCommandSupport.NormalizeBrand(request.PreferredBrand),
            now
        );
        dbContext.Products.Add(product);

        if (request.LastPurchasedOn is { } last)
        {
            // An estimate typed in the form, not a real purchase (that is ProductPurchased).
            product.DeclareLastPurchase(last, request.DefaultQuantity ?? 1, request.DefaultUnit ?? MeasurementUnit.Piece);
            dbContext.ProductEvents.Add(
                ProductLastPurchaseDeclared.Create(householdId, product.Id, currentUser.UserId, EventOrigin.Web, now, last)
            );
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return product.ToDto(ctx);
    }
}
