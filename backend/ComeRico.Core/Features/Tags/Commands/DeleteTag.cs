using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Tags.Commands;

public sealed record DeleteTagCommand(Guid Id) : IRequest<bool>;

public sealed class DeleteTagCommandHandler(IAppDbContext dbContext) : IRequestHandler<DeleteTagCommand, bool>
{
    public async Task<bool> Handle(DeleteTagCommand request, CancellationToken cancellationToken)
    {
        var tag = await dbContext.Tags.FirstOrDefaultAsync(t => t.Id == request.Id, cancellationToken);
        if (tag is null)
            return false;

        dbContext.Tags.Remove(tag);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }
}
