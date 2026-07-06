using System.Linq.Expressions;
using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ComeRico.Core.Persistence;

public static class ModelBuilderExtensions
{
    public static ModelBuilder ApplyHouseholdFilters(this ModelBuilder modelBuilder, IAppDbContext context)
    {
        foreach (
            var entityType in modelBuilder.Model.GetEntityTypes().Where(e => typeof(IHasHousehold).IsAssignableFrom(e.ClrType))
        )
        {
            var param = Expression.Parameter(entityType.ClrType, "e");
            var property = Expression.Property(param, nameof(IHasHousehold.HouseholdId));

            var contextParam = Expression.Constant(context);
            var householdId = Expression.Property(contextParam, nameof(IAppDbContext.CurrentHouseholdId));
            var equals = Expression.Equal(property, householdId);
            var filter = Expression.Lambda(equals, param);

            entityType.SetQueryFilter("HouseholdFilter", filter);
        }

        return modelBuilder;
    }
}
