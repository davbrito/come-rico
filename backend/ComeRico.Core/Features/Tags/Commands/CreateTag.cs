using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Tags.Queries;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Tags.Commands;

public sealed record CreateTagCommand(string Name) : IRequest<TagDto>;

public sealed class CreateTagCommandValidator : AbstractValidator<CreateTagCommand>
{
    public CreateTagCommandValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty()
            .WithMessage("El nombre de la etiqueta es obligatorio.")
            .MaximumLength(50)
            .WithMessage("El nombre no puede superar los 50 caracteres.");
    }
}

public sealed class CreateTagCommandHandler(IAppDbContext dbContext, ITenantService tenantService)
    : IRequestHandler<CreateTagCommand, TagDto>
{
    public async Task<TagDto> Handle(CreateTagCommand request, CancellationToken cancellationToken)
    {
        var name = request.Name.Trim();

        var exists = await dbContext.Tags.AnyAsync(t => t.Name.ToLower() == name.ToLower(), cancellationToken);
        if (exists)
            throw new InvalidOperationException($"Ya existe una etiqueta llamada \"{name}\".");

        var tag = Tag.Create(tenantService.HouseholdId, name);
        dbContext.Tags.Add(tag);
        await dbContext.SaveChangesAsync(cancellationToken);
        return new TagDto(tag.Id, tag.Name);
    }
}
