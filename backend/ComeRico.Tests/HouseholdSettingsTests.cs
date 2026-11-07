using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Households.Commands;

namespace ComeRico.Tests;

public class HouseholdSettingsTests
{
    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
    private static readonly UpdateHouseholdSettingsCommandValidator Validator = new();

    [Theory]
    [InlineData("America/Caracas", true)]
    [InlineData("Pacific/Auckland", true)]
    [InlineData("UTC", true)]
    [InlineData("Mars/Olympus", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void IsValidTimeZone_UsesEmbeddedIanaDatabase(string? id, bool expected) =>
        Assert.Equal(expected, HouseholdTime.IsValidTimeZone(id));

    [Fact]
    public void Today_UnknownZone_FallsBackToUtc()
    {
        var clock = new FixedClock(new DateTimeOffset(2026, 11, 4, 23, 30, 0, TimeSpan.Zero));
        Assert.Equal(new DateOnly(2026, 11, 4), HouseholdTime.Today("Not/AZone", clock));
    }

    [Fact]
    public void Today_ZonesBehindAndAheadOfUtc()
    {
        var clock = new FixedClock(new DateTimeOffset(2026, 11, 4, 2, 0, 0, TimeSpan.Zero));
        Assert.Equal(new DateOnly(2026, 11, 3), HouseholdTime.Today("America/Caracas", clock)); // UTC-4
        Assert.Equal(new DateOnly(2026, 11, 4), HouseholdTime.Today("Asia/Tokyo", clock)); // UTC+9
    }

    [Theory]
    [InlineData("USD", "America/Caracas", true)]
    [InlineData("eur", "UTC", true)]
    [InlineData("XXX1", "UTC", false)]
    [InlineData("ZZZ", "UTC", false)]
    [InlineData("USD", "Nope", false)]
    public void Validator_ChecksCurrencyAndTimeZone(string currency, string tz, bool valid) =>
        Assert.Equal(valid, Validator.Validate(new UpdateHouseholdSettingsCommand(DayOfWeek.Saturday, currency, tz)).IsValid);

    [Fact]
    public void Validator_RejectsOutOfRangeShoppingDay() =>
        Assert.False(Validator.Validate(new UpdateHouseholdSettingsCommand((DayOfWeek)9, "USD", "UTC")).IsValid);

    [Fact]
    public async Task Handler_UpdatesOnlyCurrentHousehold()
    {
        var db1 = Guid.NewGuid().ToString();
        var a = Household.Create("A", "UTC");
        var b = Household.Create("B", "UTC");
        await using var db = TestDb.Create(db1, a.Id);
        db.Households.AddRange(a, b);
        await db.SaveChangesAsync(Ct);

        var handler = new UpdateHouseholdSettingsCommandHandler(db, new FakeTenantService(a.Id));
        var result = await handler.Handle(new(DayOfWeek.Friday, "eur", "America/Caracas"), Ct);

        Assert.Equal(new HouseholdSettingsDto(DayOfWeek.Friday, "EUR", "America/Caracas"), result);
        Assert.Equal("UTC", b.TimeZone);
        Assert.Equal("USD", b.DefaultCurrency);
        Assert.Null(b.ShoppingDay);
    }
}
