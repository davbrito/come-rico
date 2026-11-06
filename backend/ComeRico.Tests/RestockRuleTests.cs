using ComeRico.Core.Domain.Entities;

namespace ComeRico.Tests;

public class RestockRuleTests
{
    // 2026-11-04 is a Wednesday.
    private static readonly DateOnly Today = new(2026, 11, 4);

    private static Product NewProduct(
        int? interval = 14,
        decimal? defaultQuantity = 1,
        MeasurementUnit? defaultUnit = MeasurementUnit.Package
    ) =>
        Product.Create(
            Guid.CreateVersion7(),
            "Papel de baño",
            ProductCategory.Hygiene,
            defaultQuantity,
            defaultUnit,
            interval,
            null,
            DateTime.UtcNow
        );

    private static Product Bought(
        DateOnly on,
        int? interval = 14,
        decimal quantity = 1,
        MeasurementUnit unit = MeasurementUnit.Package,
        decimal? defaultQuantity = 1,
        MeasurementUnit? defaultUnit = MeasurementUnit.Package
    )
    {
        var p = NewProduct(interval, defaultQuantity, defaultUnit);
        p.ApplyPurchase(on, quantity, unit);
        return p;
    }

    [Fact]
    public void NeverBought_WithInterval_IsDue() =>
        Assert.Equal(RestockStatus.Due, RestockRule.Evaluate(NewProduct(), Today, null));

    [Fact]
    public void NeverBought_WithoutInterval_IsOk() =>
        Assert.Equal(RestockStatus.Ok, RestockRule.Evaluate(NewProduct(interval: null), Today, null));

    [Fact]
    public void WithoutInterval_OnlyAppearsWhenOutOfStock()
    {
        var p = Bought(Today.AddDays(-365), interval: null);
        Assert.Equal(RestockStatus.Ok, RestockRule.Evaluate(p, Today, null));

        p.MarkOutOfStock(DateTime.UtcNow);
        Assert.Equal(RestockStatus.OutOfStock, RestockRule.Evaluate(p, Today, null));
    }

    [Fact]
    public void WithoutShoppingDay_IsDueExactlyWhenIntervalElapses()
    {
        Assert.Equal(RestockStatus.Due, RestockRule.Evaluate(Bought(Today.AddDays(-14)), Today, null));
        Assert.Equal(RestockStatus.DueSoon, RestockRule.Evaluate(Bought(Today.AddDays(-13)), Today, null));
    }

    [Fact]
    public void WithoutShoppingDay_FarFromDue_IsOk() =>
        Assert.Equal(RestockStatus.Ok, RestockRule.Evaluate(Bought(Today.AddDays(-2)), Today, null));

    [Fact]
    public void DueSoon_WindowIsSevenDays()
    {
        Assert.Equal(RestockStatus.DueSoon, RestockRule.Evaluate(Bought(Today.AddDays(-7)), Today, null)); // due in 7
        Assert.Equal(RestockStatus.Ok, RestockRule.Evaluate(Bought(Today.AddDays(-6)), Today, null)); // due in 8
    }

    [Fact]
    public void WithShoppingDay_AnticipatesAgainstNextShoppingDay()
    {
        // Wed 4 Nov; shopping on Saturday 7 Nov. Due Mon 9 Nov => already due for the Saturday trip.
        var p = Bought(new DateOnly(2026, 10, 26)); // + 14 = 9 Nov
        Assert.Equal(RestockStatus.DueSoon, RestockRule.Evaluate(p, Today, null));
        Assert.Equal(RestockStatus.DueSoon, RestockRule.Evaluate(p, Today, DayOfWeek.Saturday)); // 7 Nov < 9 Nov: not due yet

        var dueTuesday = Bought(new DateOnly(2026, 10, 20)); // + 14 = 3 Nov (overdue)
        Assert.Equal(RestockStatus.Due, RestockRule.Evaluate(dueTuesday, Today, DayOfWeek.Saturday));

        var dueNextMonday = Bought(new DateOnly(2026, 10, 24)); // + 14 = 7 Nov
        Assert.Equal(RestockStatus.DueSoon, RestockRule.Evaluate(dueNextMonday, Today, null));
        Assert.Equal(RestockStatus.Due, RestockRule.Evaluate(dueNextMonday, Today, DayOfWeek.Saturday)); // 7 Nov >= 7 Nov
    }

    [Fact]
    public void NextShoppingDay_IncludesToday()
    {
        Assert.Equal(Today, RestockRule.NextShoppingDay(Today, DayOfWeek.Wednesday));
        Assert.Equal(new DateOnly(2026, 11, 7), RestockRule.NextShoppingDay(Today, DayOfWeek.Saturday));
        Assert.Equal(new DateOnly(2026, 11, 9), RestockRule.NextShoppingDay(Today, DayOfWeek.Monday));
    }

    [Fact]
    public void IntervalScalesWithQuantityBought()
    {
        // 1 package every 14 days; bought 2 => lasts 28 days.
        var p = Bought(Today.AddDays(-14), quantity: 2);
        Assert.Equal(Today.AddDays(14), RestockRule.DueOn(p));
        Assert.NotEqual(RestockStatus.Due, RestockRule.Evaluate(p, Today, null));

        var overdue = Bought(Today.AddDays(-28), quantity: 2);
        Assert.Equal(RestockStatus.Due, RestockRule.Evaluate(overdue, Today, null));
    }

    [Fact]
    public void IntervalDoesNotScale_WhenUnitsDiffer()
    {
        // Default is 1 piece, bought 500 ml: no unit conversion, t stays 14.
        var p = Bought(Today.AddDays(-14), quantity: 500, unit: MeasurementUnit.Milliliter, defaultUnit: MeasurementUnit.Piece);
        Assert.Equal(Today, RestockRule.DueOn(p));
        Assert.Equal(RestockStatus.Due, RestockRule.Evaluate(p, Today, null));
    }

    [Fact]
    public void OutOfStock_AlwaysAppears_EvenWhenSnoozed()
    {
        var p = Bought(Today.AddDays(-1));
        p.SnoozeUntil(Today.AddDays(30));
        p.MarkOutOfStock(DateTime.UtcNow);

        Assert.Equal(RestockStatus.OutOfStock, RestockRule.Evaluate(p, Today, null));
    }

    [Fact]
    public void Snooze_DefersTimeBasedAppearance()
    {
        var p = Bought(Today.AddDays(-30));
        Assert.Equal(RestockStatus.Due, RestockRule.Evaluate(p, Today, null));

        p.SnoozeUntil(Today.AddDays(3));
        Assert.NotEqual(RestockStatus.Due, RestockRule.Evaluate(p, Today, null));
        Assert.Equal(RestockStatus.Due, RestockRule.Evaluate(p, Today.AddDays(3), null));
    }

    [Fact]
    public void Snooze_AlsoDefersAProductThatWasNeverBought()
    {
        var p = NewProduct();
        p.SnoozeUntil(Today.AddDays(7));
        Assert.NotEqual(RestockStatus.Due, RestockRule.Evaluate(p, Today, null));
    }

    [Fact]
    public void Purchase_ClearsOutOfStockAndSnooze()
    {
        var p = Bought(Today.AddDays(-30));
        p.SnoozeUntil(Today.AddDays(3));
        p.MarkOutOfStock(DateTime.UtcNow);

        p.ApplyPurchase(Today, 1, MeasurementUnit.Package);

        Assert.Null(p.OutOfStockAt);
        Assert.Null(p.SnoozedUntil);
        Assert.Equal(RestockStatus.Ok, RestockRule.Evaluate(p, Today, null));
    }
}
