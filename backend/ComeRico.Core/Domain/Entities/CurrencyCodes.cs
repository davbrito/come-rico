namespace ComeRico.Core.Domain.Entities;

/// <summary>ISO 4217 alphabetic currency codes accepted for a household's default currency.</summary>
public static class CurrencyCodes
{
    private static readonly HashSet<string> Known = new(StringComparer.Ordinal)
    {
        "AED","ARS","AUD","BAM","BBD","BDT","BGN","BHD","BOB","BRL","BSD","BWP","BZD","CAD","CHF","CLP","CNY","COP","CRC","CUP",
        "CZK","DKK","DOP","DZD","EGP","EUR","FJD","GBP","GEL","GHS","GTQ","GYD","HKD","HNL","HRK","HUF","IDR","ILS","INR","IQD",
        "ISK","JMD","JOD","JPY","KES","KRW","KWD","KZT","LBP","LKR","MAD","MDL","MKD","MXN","MYR","NAD","NGN","NIO","NOK","NZD",
        "OMR","PAB","PEN","PHP","PKR","PLN","PYG","QAR","RON","RSD","RUB","SAR","SEK","SGD","SVC","THB","TND","TRY","TTD","TWD",
        "UAH","USD","UYU","VES","VND","XAF","XOF","ZAR",
    };

    public static bool IsValid(string? code) => code is { Length: 3 } && Known.Contains(code.Trim().ToUpperInvariant());
}
