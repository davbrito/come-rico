namespace ComeRico.Core.Interfaces;

public interface ITenantService
{
    Guid HouseholdId { get; }
    bool IsResolved { get; }
}
