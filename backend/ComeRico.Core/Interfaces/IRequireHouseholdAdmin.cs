namespace ComeRico.Core.Interfaces;

/// <summary>
/// Marker interface for MediatR requests that require the current user to be a household admin.
/// Enforced by <c>AdminOnlyBehavior</c> in the MediatR pipeline.
/// </summary>
public interface IRequireHouseholdAdmin { }
