using ComeRico.Core.Auth;
using ComeRico.Core.Features.Roulette.Commands;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace ComeRico.Api.Hubs;

/// <summary>
/// Real-time roulette hub. Broadcasts events to connected household members.
/// This hub only broadcasts events — all business logic is handled by MediatR commands.
/// The household group is resolved from the auth cookie's claims, never from the client,
/// so a user can only ever listen to their own household.
/// </summary>
[Authorize]
public sealed class RouletteHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        if (TryGetHouseholdGroup(out var group))
            await Groups.AddToGroupAsync(Context.ConnectionId, group);

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (TryGetHouseholdGroup(out var group))
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, group);

        await base.OnDisconnectedAsync(exception);
    }

    private bool TryGetHouseholdGroup(out string group)
    {
        var householdId = Context.User?.FindFirst(AppClaimTypes.HouseholdId)?.Value;
        group = $"household-{householdId}";
        return !string.IsNullOrEmpty(householdId);
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
