using System.Security.Claims;
using ComeRico.Core.Auth;
using ComeRico.Infrastructure.Services;
using Microsoft.AspNetCore.Http;

namespace ComeRico.Tests;

public class ClaimsTenantServiceTests
{
    private static ClaimsTenantService CreateService(ClaimsPrincipal user)
    {
        var httpContext = new DefaultHttpContext { User = user };
        var accessor = new HttpContextAccessor { HttpContext = httpContext };
        return new ClaimsTenantService(accessor);
    }

    private static ClaimsPrincipal PrincipalWithClaim(string? value)
    {
        var identity = new ClaimsIdentity(authenticationType: "Test");
        if (value is not null)
            identity.AddClaim(new Claim(AppClaimTypes.HouseholdId, value));
        return new ClaimsPrincipal(identity);
    }

    [Fact]
    public void HouseholdId_ReturnsParsedGuid_WhenClaimIsPresentAndValid()
    {
        var householdId = Guid.CreateVersion7();
        var service = CreateService(PrincipalWithClaim(householdId.ToString()));

        Assert.Equal(householdId, service.HouseholdId);
    }

    [Fact]
    public void HouseholdId_Throws_WhenClaimIsMissing()
    {
        var service = CreateService(PrincipalWithClaim(null));

        Assert.Throws<InvalidOperationException>(() => service.HouseholdId);
    }

    [Fact]
    public void HouseholdId_Throws_WhenClaimIsNotAGuid()
    {
        var service = CreateService(PrincipalWithClaim("not-a-guid"));

        Assert.Throws<InvalidOperationException>(() => service.HouseholdId);
    }

    [Fact]
    public void HouseholdId_Throws_WhenHttpContextIsMissing()
    {
        var service = new ClaimsTenantService(new HttpContextAccessor());

        Assert.Throws<InvalidOperationException>(() => service.HouseholdId);
    }
}
