using ComeRico.Core.Interfaces;
using MediatR;

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
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }
}
