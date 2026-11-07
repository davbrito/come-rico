using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Products.Commands;

/// <summary>Deactivates the product; its event history is append-only and is kept.</summary>
public sealed record DeleteProductCommand(Guid ProductId) : IRequest<bool>;

public sealed class DeleteProductCommandHandler(IAppDbContext dbContext) : IRequestHandler<DeleteProductCommand, bool>
{
    public async Task<bool> Handle(DeleteProductCommand request, CancellationToken cancellationToken)
    {
        var product = await dbContext.FindActiveAsync(request.ProductId, cancellationToken);
        if (product is null)
            return false;

        product.Deactivate();
        // Its pending recurring item leaves the list too (history is kept).
        var pending = await dbContext
            .ShoppingItems.Where(s =>
                s.ProductId == product.Id
                && s.Source == ShoppingItemSource.Recurring
                && s.Status == ShoppingItemStatus.Pending
                && s.DismissedAt == null
            )
            .ToListAsync(cancellationToken);
        dbContext.ShoppingItems.RemoveRange(pending);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }
}
