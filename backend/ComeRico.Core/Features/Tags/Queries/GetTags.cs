using ComeRico.Core.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Tags.Queries;

public sealed record GetTagsQuery : IRequest<IReadOnlyList<TagDto>>;

public sealed record TagDto(Guid Id, string Name);

public sealed class GetTagsQueryHandler(IAppDbContext dbContext) : IRequestHandler<GetTagsQuery, IReadOnlyList<TagDto>>
{
    public async Task<IReadOnlyList<TagDto>> Handle(GetTagsQuery request, CancellationToken cancellationToken)
    {
        return await dbContext.Tags.OrderBy(t => t.Name).Select(t => new TagDto(t.Id, t.Name)).ToListAsync(cancellationToken);
    }
}
