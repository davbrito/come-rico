namespace ComeRico.Core.Domain.Entities;

/// <summary>Monetary value: <see cref="Amount"/> (numeric(12,2)) plus ISO 4217 <see cref="Currency"/>.</summary>
public sealed record Money(decimal Amount, string Currency);
