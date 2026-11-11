using ComeRico.Core.Domain.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Api.Auth;

public enum AuthKitSignInError
{
    /// <summary>WorkOS has not verified the email, so it can't be trusted to match or create an account.</summary>
    EmailNotVerified,

    /// <summary>The email belongs to an account already linked to a different WorkOS user.</summary>
    EmailLinkedToAnotherUser,
}

public sealed record AuthKitSignInResult(AppUser? User, AuthKitSignInError? Error)
{
    public static AuthKitSignInResult Success(AppUser user) => new(user, null);

    public static AuthKitSignInResult Failure(AuthKitSignInError error) => new(null, error);
}

/// <summary>
/// Maps an authenticated WorkOS user to our <see cref="AppUser"/>:
/// by WorkOS id; else — first AuthKit login of an account that predates the migration —
/// by verified email, linking it; else creating it (first login after accepting an invitation).
/// Who is allowed to sign up at all is WorkOS's job (sign-up disabled + invitations).
/// </summary>
public sealed class AuthKitUserProvisioner(UserManager<AppUser> userManager, ILogger<AuthKitUserProvisioner> logger)
{
    private const int DisplayNameMaxLength = 200;

    public async Task<AuthKitSignInResult> FindOrCreateAsync(WorkOsUser workOsUser, CancellationToken ct)
    {
        var linked = await FindByWorkOsIdAsync(workOsUser.Id, ct);
        if (linked is not null)
            return AuthKitSignInResult.Success(linked);

        // Past this point the email decides which account (if any) the person gets, so it
        // has to be one WorkOS has verified — otherwise anyone could claim someone's account.
        if (!workOsUser.EmailVerified)
            return AuthKitSignInResult.Failure(AuthKitSignInError.EmailNotVerified);

        var byEmail = await userManager.FindByEmailAsync(workOsUser.Email);
        if (byEmail is not null)
        {
            if (byEmail.WorkOsUserId is not null)
                return AuthKitSignInResult.Failure(AuthKitSignInError.EmailLinkedToAnotherUser);

            byEmail.LinkWorkOsUser(workOsUser.Id);
            byEmail.EmailConfirmed = true;
            EnsureSucceeded(await userManager.UpdateAsync(byEmail), "vincular");
            logger.LogInformation(
                "Linked existing user {UserId} to WorkOS user {WorkOsUserId} by email",
                byEmail.Id,
                workOsUser.Id
            );
            return AuthKitSignInResult.Success(byEmail);
        }

        var user = new AppUser
        {
            DisplayName = DisplayNameFor(workOsUser),
            UserName = workOsUser.Email,
            Email = workOsUser.Email,
            EmailConfirmed = true,
        };
        user.LinkWorkOsUser(workOsUser.Id);

        IdentityResult created;
        try
        {
            created = await userManager.CreateAsync(user);
        }
        catch (DbUpdateException)
        {
            // Two first logins of the same person at once: the unique index let one through.
            created = IdentityResult.Failed();
        }

        if (!created.Succeeded)
        {
            var winner = await FindByWorkOsIdAsync(workOsUser.Id, ct);
            if (winner is not null)
                return AuthKitSignInResult.Success(winner);
            EnsureSucceeded(created, "crear");
        }

        logger.LogInformation("Created user {UserId} for WorkOS user {WorkOsUserId}", user.Id, workOsUser.Id);
        return AuthKitSignInResult.Success(user);
    }

    private Task<AppUser?> FindByWorkOsIdAsync(string workOsUserId, CancellationToken ct) =>
        userManager.Users.FirstOrDefaultAsync(u => u.WorkOsUserId == workOsUserId, ct);

    private static string DisplayNameFor(WorkOsUser workOsUser)
    {
        var name = $"{workOsUser.FirstName} {workOsUser.LastName}".Trim();
        if (name.Length == 0)
            name = workOsUser.Email.Split('@')[0];
        return name.Length > DisplayNameMaxLength ? name[..DisplayNameMaxLength] : name;
    }

    private static void EnsureSucceeded(IdentityResult result, string action)
    {
        if (!result.Succeeded)
            throw new InvalidOperationException(
                $"No se pudo {action} el usuario: {string.Join(" ", result.Errors.Select(e => e.Description))}"
            );
    }
}
