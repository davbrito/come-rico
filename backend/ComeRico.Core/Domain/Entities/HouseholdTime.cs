using Microsoft.Extensions.Logging;

namespace ComeRico.Core.Domain.Entities;

/// <summary>"Today" for a household is the local date in its IANA time zone, never the server's UTC date.</summary>
public static class HouseholdTime
{
    private static ILogger logger = Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance;

    /// <summary>Wires the logger used for the UTC fallback warning (called once at startup).</summary>
    public static void Configure(ILoggerFactory loggerFactory) => logger = loggerFactory.CreateLogger("ComeRico.HouseholdTime");

    public static bool IsValidTimeZone(string? id) => TryFind(id) is not null;

    /// <summary>Local date in <paramref name="timeZoneId"/>; falls back to UTC (and logs) if the zone can't be resolved.</summary>
    public static DateOnly Today(string timeZoneId, TimeProvider clock) => ToLocalDate(clock.GetUtcNow(), timeZoneId);

    /// <summary>The household-local date of an instant.</summary>
    public static DateOnly ToLocalDate(DateTimeOffset instant, string timeZoneId) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, Resolve(timeZoneId)).DateTime);

    /// <summary>The UTC instant at which <paramref name="date"/> starts in the household's zone.</summary>
    public static DateTime StartOfDayUtc(DateOnly date, string timeZoneId)
    {
        var tz = Resolve(timeZoneId);
        var local = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        // A DST gap can skip midnight; the first valid instant is then one hour later.
        if (tz.IsInvalidTime(local))
            local = local.AddHours(1);
        return TimeZoneInfo.ConvertTimeToUtc(local, tz);
    }

    private static TimeZoneInfo Resolve(string timeZoneId)
    {
        var tz = TryFind(timeZoneId);
        if (tz is null)
        {
            logger.LogWarning("Unknown household time zone '{TimeZone}'; falling back to UTC.", timeZoneId);
            tz = TimeZoneInfo.Utc;
        }
        return tz;
    }

    private static TimeZoneInfo? TryFind(string? id)
    {
        if (string.IsNullOrWhiteSpace(id))
            return null;
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id);
        }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return null;
        }
    }
}
