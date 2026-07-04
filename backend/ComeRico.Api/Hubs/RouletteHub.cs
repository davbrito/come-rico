using ComeRico.Core.Features.Roulette.Commands;
using Microsoft.AspNetCore.SignalR;

namespace ComeRico.Api.Hubs;

/// <summary>
/// Real-time roulette hub. Broadcasts events to connected household members.
/// This hub only broadcasts events — all business logic is handled by MediatR commands.
/// </summary>
public sealed class RouletteHub : Hub
{
    public async Task JoinHouseholdGroup(string householdId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"household-{householdId}");
    }

    public async Task LeaveHouseholdGroup(string householdId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"household-{householdId}");
    }
}

/// <summary>
/// Typed client contract for the roulette hub.
/// </summary>
public interface IRouletteHubClient
{
    Task RouletteSpun(SpinRouletteResult result);
    Task RouletteStarted(string householdId);
}
