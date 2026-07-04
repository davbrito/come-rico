using Npgsql;

namespace ComeRico.Api.Extensions;

/// <summary>
/// Resolves the PostgreSQL connection string. Prefers a URI-style DATABASE_URL
/// (the format Neon's Vercel integration injects: postgres://user:pass@host/db?sslmode=require)
/// and converts it to the keyword format Npgsql expects; falls back to
/// ConnectionStrings:DefaultConnection for local development.
/// </summary>
public static class ConnectionStringResolver
{
    public static string Resolve(IConfiguration configuration)
    {
        var databaseUrl = configuration["DATABASE_URL"];
        if (!string.IsNullOrWhiteSpace(databaseUrl))
            return FromDatabaseUrl(databaseUrl);

        return configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException(
                "No database configured. Set DATABASE_URL or ConnectionStrings:DefaultConnection.");
    }

    public static string FromDatabaseUrl(string databaseUrl)
    {
        var uri = new Uri(databaseUrl);
        var userInfo = uri.UserInfo.Split(':', 2);

        var csBuilder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort ? 5432 : uri.Port,
            Database = uri.AbsolutePath.TrimStart('/'),
            Username = Uri.UnescapeDataString(userInfo[0]),
            SslMode = SslMode.Require,
        };

        if (userInfo.Length > 1)
            csBuilder.Password = Uri.UnescapeDataString(userInfo[1]);

        // Honor sslmode/channel_binding query params when present (Neon appends them)
        var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
        if (query["sslmode"] is { } sslMode && Enum.TryParse<SslMode>(sslMode, ignoreCase: true, out var parsedSsl))
            csBuilder.SslMode = parsedSsl;
        if (query["channel_binding"] is { } cb && Enum.TryParse<Npgsql.ChannelBinding>(cb, ignoreCase: true, out var parsedCb))
            csBuilder.ChannelBinding = parsedCb;

        return csBuilder.ConnectionString;
    }
}
