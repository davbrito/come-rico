using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using ComeRico.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Tests;

public sealed class FakeTenantService(Guid householdId) : ITenantService
{
    public FakeTenantService()
        : this(Guid.Empty) { }

    public Guid HouseholdId => householdId;
}

public sealed class FakeCurrentUserService(Guid userId) : ICurrentUserService
{
    public Guid UserId => userId;
    public bool IsAuthenticated => true;
    public HouseholdRole? Role => null;
}

public sealed class FakeFileStorage : IFileStorage
{
    public Task<string> CreateSignedUploadAsync(string key, string contentType, long sizeBytes, TimeSpan expiresIn, CancellationToken ct) =>
        throw new NotSupportedException("Not used by tests that don't upload images.");

    public string GetPublicUrl(string key) => $"https://example.test/{key}";

    public Task CopyAsync(string sourceKey, string destinationKey, CancellationToken ct) =>
        throw new NotSupportedException("Not used by tests that don't upload images.");

    public Task DeleteAsync(string key, CancellationToken ct) => throw new NotSupportedException("Not used by tests that don't upload images.");
}

public static class TestDb
{
    public static AppDbContext Create(string databaseName, Guid householdId) =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(databaseName).Options, new FakeTenantService(householdId));
}
