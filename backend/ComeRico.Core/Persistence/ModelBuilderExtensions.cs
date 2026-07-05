using System.Linq.Expressions;
using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Persistence;

public static class ModelBuilderExtensions
{
    public static ModelBuilder ApplyHouseholdFilters(this ModelBuilder modelBuilder, ITenantService tenantService)
    {
        foreach (var entityType in modelBuilder.Model.GetEntityTypes()
                     .Where(e => typeof(IHasHousehold).IsAssignableFrom(e.ClrType)))
        {
            var param = Expression.Parameter(entityType.ClrType, "e");
            var property = Expression.Property(param, nameof(IHasHousehold.HouseholdId));

            var tenant = Expression.Constant(tenantService);
            var isResolved = Expression.Property(tenant, nameof(ITenantService.IsResolved));
            var notResolved = Expression.Not(isResolved);
            var householdId = Expression.Property(tenant, nameof(ITenantService.HouseholdId));
            var equals = Expression.Equal(property, householdId);

            var body = Expression.OrElse(notResolved, equals);
            var filter = Expression.Lambda(body, param);

            entityType.SetQueryFilter(filter);
        }

        return modelBuilder;
    }
}
