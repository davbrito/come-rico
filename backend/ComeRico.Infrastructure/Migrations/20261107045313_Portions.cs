using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComeRico.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Portions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Quantities are "Quantity" (money is Money.Amount); keep the data, widen the precision.
            migrationBuilder.RenameColumn(name: "Amount", table: "Ingredients", newName: "Quantity");
            migrationBuilder.AlterColumn<decimal>(
                name: "Quantity",
                table: "Ingredients",
                type: "numeric(12,4)",
                precision: 12,
                scale: 4,
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(10,2)",
                oldPrecision: 10,
                oldScale: 2);

            migrationBuilder.AddColumn<int>(
                name: "DefaultServings",
                table: "Households",
                type: "integer",
                nullable: false,
                defaultValue: 2);

            // Existing dishes and planned meals take their household's default, so lists don't change.
            migrationBuilder.AddColumn<int>(
                name: "Servings",
                table: "Dishes",
                type: "integer",
                nullable: false,
                defaultValue: 2);
            migrationBuilder.Sql(
                "UPDATE \"Dishes\" d SET \"Servings\" = h.\"DefaultServings\" FROM \"Households\" h WHERE h.\"Id\" = d.\"HouseholdId\";");

            migrationBuilder.AddColumn<int>(
                name: "Servings",
                table: "MealPlans",
                type: "integer",
                nullable: false,
                defaultValue: 2);
            migrationBuilder.Sql(
                "UPDATE \"MealPlans\" m SET \"Servings\" = h.\"DefaultServings\" FROM \"Households\" h WHERE h.\"Id\" = m.\"HouseholdId\";");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Households_DefaultServings",
                table: "Households",
                sql: "\"DefaultServings\" > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Dishes_Servings",
                table: "Dishes",
                sql: "\"Servings\" > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_MealPlans_Servings",
                table: "MealPlans",
                sql: "\"Servings\" > 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_MealPlans_Servings",
                table: "MealPlans");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Households_DefaultServings",
                table: "Households");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Dishes_Servings",
                table: "Dishes");

            migrationBuilder.DropColumn(
                name: "Servings",
                table: "MealPlans");

            migrationBuilder.DropColumn(
                name: "Servings",
                table: "Dishes");

            migrationBuilder.DropColumn(
                name: "DefaultServings",
                table: "Households");

            migrationBuilder.AlterColumn<decimal>(
                name: "Quantity",
                table: "Ingredients",
                type: "numeric(10,2)",
                precision: 10,
                scale: 2,
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(12,4)",
                oldPrecision: 12,
                oldScale: 4);
            migrationBuilder.RenameColumn(name: "Quantity", table: "Ingredients", newName: "Amount");
        }
    }
}
