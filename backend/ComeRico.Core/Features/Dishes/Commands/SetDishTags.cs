using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Dishes.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Dishes.Commands;

public sealed record SetDishTagsCommand(Guid DishId, IReadOnlyList<string> TagNames) : IRequest<DishDto?>;

public sealed class SetDishTagsCommandValidator : AbstractValidator<SetDishTagsCommand>
{
    public SetDishTagsCommandValidator()
    {
        RuleFor(x => x.DishId).NotEmpty().WithMessage("El identificador del platillo es obligatorio.");
        RuleForEach(x => x.TagNames)
            .NotEmpty()
            .WithMessage("El nombre de la etiqueta es obligatorio.")
            .MaximumLength(50)
            .WithMessage("El nombre de la etiqueta no puede superar los 50 caracteres.");
    }
}

public sealed class SetDishTagsCommandHandler(IAppDbContext dbContext, ITenantService tenantService, IFileStorage storage)
    : IRequestHandler<SetDishTagsCommand, DishDto?>
{
    public async Task<DishDto?> Handle(SetDishTagsCommand request, CancellationToken cancellationToken)
    {
        var dish = await dbContext
            .Dishes.Include(d => d.Tags)
            .FirstOrDefaultAsync(d => d.Id == request.DishId, cancellationToken);
        if (dish is null)
            return null;

        var names = request
            .TagNames.Select(n => n.Trim())
            .Where(n => n.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var existingTags = await dbContext
            .Tags.Where(t => names.Contains(t.Name))
            .ToDictionaryAsync(t => t.Name, StringComparer.OrdinalIgnoreCase, cancellationToken);
        var tags = new List<Tag>();
        foreach (var name in names)
        {
            var tag = existingTags.GetValueOrDefault(name);
            if (tag is null)
            {
                tag = Tag.Create(tenantService.HouseholdId, name);
                dbContext.Tags.Add(tag);
                existingTags.Add(name, tag);
            }
            tags.Add(tag);
        }

        dish.ReplaceTags(tags);

        await dbContext.SaveChangesAsync(cancellationToken);
        await dbContext.Entry(dish).Collection(d => d.Ingredients).LoadAsync(cancellationToken);

        return dish.ToDto(storage);
    }
}
