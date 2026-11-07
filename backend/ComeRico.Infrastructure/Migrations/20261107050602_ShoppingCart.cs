using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComeRico.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ShoppingCart : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "QuantityOverridden",
                table: "ShoppingItems",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "InCartAt",
                table: "ShoppingItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "InCartByUserId",
                table: "ShoppingItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ShoppingTripId",
                table: "ShoppingItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "ShoppingItems",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Pending");
            // Checked-off items were purchases without a trip (before checkout existed); the check
            // constraint needs a PurchasedAt, so they keep their own or fall back to their creation date.
            migrationBuilder.Sql(
                "UPDATE \"ShoppingItems\" SET \"Status\" = 'Purchased', \"PurchasedAt\" = COALESCE(\"PurchasedAt\", \"CreatedAt\") WHERE \"IsPurchased\";");
            migrationBuilder.Sql("ALTER TABLE \"ShoppingItems\" ALTER COLUMN \"Status\" DROP DEFAULT;");

            migrationBuilder.DropColumn(
                name: "IsPurchased",
                table: "ShoppingItems");


            migrationBuilder.CreateTable(
                name: "ShoppingTrips",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Store = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    TotalPaid_Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    TotalPaid_Currency = table.Column<string>(type: "character(3)", fixedLength: true, maxLength: 3, nullable: true),
                    Origin = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    RevertedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShoppingTrips", x => x.Id);
                    table.CheckConstraint("CK_ShoppingTrips_TotalPaid", "(\"TotalPaid_Amount\" IS NULL) = (\"TotalPaid_Currency\" IS NULL)");
                    table.ForeignKey(
                        name: "FK_ShoppingTrips_Households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalTable: "Households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ShoppingItems_HouseholdId_Status",
                table: "ShoppingItems",
                columns: new[] { "HouseholdId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_ShoppingItems_ShoppingTripId",
                table: "ShoppingItems",
                column: "ShoppingTripId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ShoppingItems_Purchased",
                table: "ShoppingItems",
                sql: "\"Status\" <> 'Purchased' OR \"PurchasedAt\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ShoppingTrips_HouseholdId_CompletedAt",
                table: "ShoppingTrips",
                columns: new[] { "HouseholdId", "CompletedAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_ShoppingItems_ShoppingTrips_ShoppingTripId",
                table: "ShoppingItems",
                column: "ShoppingTripId",
                principalTable: "ShoppingTrips",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ShoppingItems_ShoppingTrips_ShoppingTripId",
                table: "ShoppingItems");

            migrationBuilder.DropTable(
                name: "ShoppingTrips");

            migrationBuilder.DropIndex(
                name: "IX_ShoppingItems_HouseholdId_Status",
                table: "ShoppingItems");

            migrationBuilder.DropIndex(
                name: "IX_ShoppingItems_ShoppingTripId",
                table: "ShoppingItems");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ShoppingItems_Purchased",
                table: "ShoppingItems");

            migrationBuilder.AddColumn<bool>(
                name: "IsPurchased",
                table: "ShoppingItems",
                type: "boolean",
                nullable: false,
                defaultValue: false);
            migrationBuilder.Sql(
                "UPDATE \"ShoppingItems\" SET \"IsPurchased\" = (\"Status\" = 'Purchased');");

            migrationBuilder.DropColumn(
                name: "InCartAt",
                table: "ShoppingItems");

            migrationBuilder.DropColumn(
                name: "InCartByUserId",
                table: "ShoppingItems");

            migrationBuilder.DropColumn(
                name: "ShoppingTripId",
                table: "ShoppingItems");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "ShoppingItems");

            migrationBuilder.DropColumn(
                name: "QuantityOverridden",
                table: "ShoppingItems");
        }
    }
}
