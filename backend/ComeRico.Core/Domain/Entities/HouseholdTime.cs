using Microsoft.Extensions.Logging;
using NodaTime;

namespace ComeRico.Core.Domain.Entities;

/// <summary>
/// "Today" for a household is the local date in its IANA time zone, never the server's UTC date.
/// Uses NodaTime's embedded tzdata so it doesn't depend on the host OS having zoneinfo
/// (the managed Lambda runtime may not ship it).
/// </summary>
public static class HouseholdTime
{
    private static ILogger logger = Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance;

    /// <summary>Wires the logger used for the UTC fallback warning (called once at startup).</summary>
    public static void Configure(ILoggerFactory loggerFactory) => logger = loggerFactory.CreateLogger("ComeRico.HouseholdTime");

    public static bool IsValidTimeZone(string? id) => !string.IsNullOrWhiteSpace(id) && DateTimeZoneProviders.Tzdb.GetZoneOrNull(id) is not null;

    /// <summary>Local date in <paramref name="timeZoneId"/>; falls back to UTC (and logs) if the zone is unknown.</summary>
    public static DateOnly Today(string timeZoneId, TimeProvider clock)
    {
        var zone = string.IsNullOrWhiteSpace(timeZoneId) ? null : DateTimeZoneProviders.Tzdb.GetZoneOrNull(timeZoneId);
        if (zone is null)
        {
            logger.LogWarning("Unknown household time zone '{TimeZone}'; falling back to UTC.", timeZoneId);
            zone = DateTimeZone.Utc;
        }

        var local = Instant.FromDateTimeOffset(clock.GetUtcNow()).InZone(zone).Date;
        return new DateOnly(local.Year, local.Month, local.Day);
    }
}
