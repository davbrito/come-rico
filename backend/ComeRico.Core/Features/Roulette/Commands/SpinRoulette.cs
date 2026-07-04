using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Features.Roulette.Commands;

public sealed record SpinRouletteCommand : IRequest<SpinRouletteResult>;

public sealed record SpinRouletteResult(
    Guid SessionId,
    Guid HouseholdId,
    Guid WinnerDishId,
    string WinnerDishName,
    DateTime SpunAt
);

public sealed class SpinRouletteCommandHandler(IAppDbContext dbContext, ITenantService tenantService)
    : IRequestHandler<SpinRouletteCommand, SpinRouletteResult>
{
    public async Task<SpinRouletteResult> Handle(SpinRouletteCommand request, CancellationToken cancellationToken)
    {
        var activeDishes = await dbContext.Dishes
            .Where(d => d.IsActive)
            .ToListAsync(cancellationToken);

        if (activeDishes.Count == 0)
            throw new InvalidOperationException("No hay platillos activos para girar la ruleta.");

        var winner = activeDishes[Random.Shared.Next(activeDishes.Count)];

        var session = RouletteSession.Create(tenantService.HouseholdId);
        session.SetWinner(winner.Id);

        dbContext.RouletteSessions.Add(session);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new SpinRouletteResult(
            session.Id,
            session.HouseholdId,
            winner.Id,
            winner.Name,
            session.SpunAt!.Value
        );
    }
}
