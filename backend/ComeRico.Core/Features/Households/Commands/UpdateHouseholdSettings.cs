using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;

namespace ComeRico.Core.Features.Households.Commands;

public sealed record HouseholdSettingsDto(DayOfWeek? ShoppingDay, string DefaultCurrency, string TimeZone);

/// <summary>Only household admins can change these (same rule as renaming / rotating the invite code).</summary>
public sealed record UpdateHouseholdSettingsCommand(DayOfWeek? ShoppingDay, string DefaultCurrency, string TimeZone)
    : IRequest<HouseholdSettingsDto>,
        IRequireHouseholdAdmin;

public sealed class UpdateHouseholdSettingsCommandValidator : AbstractValidator<UpdateHouseholdSettingsCommand>
{
    public UpdateHouseholdSettingsCommandValidator()
    {
        RuleFor(x => x.ShoppingDay).IsInEnum().WithMessage("El día de compra no es válido.").When(x => x.ShoppingDay is not null);
        RuleFor(x => x.DefaultCurrency)
            .Must(CurrencyCodes.IsValid)
            .WithMessage("La moneda no es válida (se espera un código ISO 4217, p. ej. USD).");
        RuleFor(x => x.TimeZone)
            .Must(HouseholdTime.IsValidTimeZone)
            .WithMessage("La zona horaria no es válida (se espera un identificador IANA, p. ej. America/Caracas).");
    }
}

public sealed class UpdateHouseholdSettingsCommandHandler(IAppDbContext dbContext, ITenantService tenant)
    : IRequestHandler<UpdateHouseholdSettingsCommand, HouseholdSettingsDto>
{
    public async Task<HouseholdSettingsDto> Handle(UpdateHouseholdSettingsCommand request, CancellationToken cancellationToken)
    {
        var household =
            await dbContext.Households.FindAsync([tenant.HouseholdId], cancellationToken: cancellationToken)
            ?? throw new InvalidOperationException("Hogar no encontrado.");

        household.SetShoppingDay(request.ShoppingDay);
        household.SetDefaultCurrency(request.DefaultCurrency);
        household.SetTimeZone(request.TimeZone.Trim());

        await dbContext.SaveChangesAsync(cancellationToken);
        return new HouseholdSettingsDto(household.ShoppingDay, household.DefaultCurrency, household.TimeZone);
    }
}
