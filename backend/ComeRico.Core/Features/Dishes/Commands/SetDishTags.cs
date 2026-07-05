using ComeRico.Core.Features.Dishes.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Dishes.Commands;

public sealed record SetDishTagsCommand(Guid DishId, IReadOnlyList<Guid> TagIds) : IRequest<DishDto?>;

public sealed class SetDishTagsCommandValidator : AbstractValidator<SetDishTagsCommand>
{
    public SetDishTagsCommandValidator()
    {
        RuleFor(x => x.DishId).NotEmpty().WithMessage("El identificador del platillo es obligatorio.");
    }
}

public sealed class SetDishTagsCommandHandler(IAppDbContext dbContext) : IRequestHandler<SetDishTagsCommand, DishDto?>
{
    public async Task<DishDto?> Handle(SetDishTagsCommand request, CancellationToken cancellationToken)
    {
        var dish = await dbContext
            .Dishes.Include(d => d.Ingredients)
            .Include(d => d.Tags)
            .FirstOrDefaultAsync(d => d.Id == request.DishId, cancellationToken);
        if (dish is null)
            return null;

        var tagIds = request.TagIds.Distinct().ToList();
        var tags = await dbContext.Tags.Where(t => tagIds.Contains(t.Id)).ToListAsync(cancellationToken);

        if (tags.Count != tagIds.Count)
            throw new InvalidOperationException("Una o más etiquetas no existen en este hogar.");

        dish.ReplaceTags(tags);
        await dbContext.SaveChangesAsync(cancellationToken);
        return dish.ToDto();
    }
}
