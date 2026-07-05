using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Shopping.Commands;

public sealed record DeleteShoppingItemCommand(Guid Id) : IRequest<bool>;

public sealed class DeleteShoppingItemCommandHandler(IAppDbContext dbContext) : IRequestHandler<DeleteShoppingItemCommand, bool>
{
    public async Task<bool> Handle(DeleteShoppingItemCommand request, CancellationToken cancellationToken)
    {
        var item = await dbContext.ShoppingItems.FirstOrDefaultAsync(s => s.Id == request.Id, cancellationToken);
        if (item is null)
            return false;

        dbContext.ShoppingItems.Remove(item);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }
}
