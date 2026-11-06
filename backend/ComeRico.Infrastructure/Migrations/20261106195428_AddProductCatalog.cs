using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComeRico.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddProductCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DefaultCurrency",
                table: "Households",
                type: "character(3)",
                fixedLength: true,
                maxLength: 3,
                nullable: false,
                defaultValue: "MXN"
            );

            migrationBuilder.AddColumn<string>(
                name: "ShoppingDay",
                table: "Households",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true
            );

            migrationBuilder.CreateTable(
                name: "Products",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Category = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    DefaultQuantity = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    DefaultUnit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    RestockIntervalDays = table.Column<int>(type: "integer", nullable: true),
                    PreferredBrand = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    LastPurchasedOn = table.Column<DateOnly>(type: "date", nullable: true),
                    LastPurchasedQuantity = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    LastPurchasedUnit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    OutOfStockAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SnoozedUntil = table.Column<DateOnly>(type: "date", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Products", x => x.Id);
                    table.CheckConstraint(
                        "CK_Products_DefaultQuantity",
                        "\"DefaultQuantity\" IS NULL OR \"DefaultQuantity\" > 0"
                    );
                    table.CheckConstraint(
                        "CK_Products_RestockIntervalDays",
                        "\"RestockIntervalDays\" IS NULL OR \"RestockIntervalDays\" > 0"
                    );
                    table.ForeignKey(
                        name: "FK_Products_Households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalTable: "Households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "ProductEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    OccurredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RecordedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Origin = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    OldDays = table.Column<int>(type: "integer", nullable: true),
                    NewDays = table.Column<int>(type: "integer", nullable: true),
                    PurchaseEventId = table.Column<Guid>(type: "uuid", nullable: true),
                    ShoppingItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    ShoppingTripId = table.Column<Guid>(type: "uuid", nullable: true),
                    Quantity = table.Column<decimal>(type: "numeric(10,3)", precision: 10, scale: 3, nullable: true),
                    Unit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    LineTotal_Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    LineTotal_Currency = table.Column<string>(
                        type: "character(3)",
                        fixedLength: true,
                        maxLength: 3,
                        nullable: true
                    ),
                    Brand = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Store = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ReceiptLineText = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Days = table.Column<int>(type: "integer", nullable: true),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductEvents", x => x.Id);
                    table.CheckConstraint(
                        "CK_ProductEvents_LineTotal",
                        "(\"LineTotal_Amount\" IS NULL) = (\"LineTotal_Currency\" IS NULL) AND (\"LineTotal_Amount\" IS NULL OR \"Type\" = 'Purchased')"
                    );
                    table.CheckConstraint(
                        "CK_ProductEvents_Purchased",
                        "\"Type\" <> 'Purchased' OR (\"Quantity\" IS NOT NULL AND \"Unit\" IS NOT NULL)"
                    );
                    table.CheckConstraint(
                        "CK_ProductEvents_PurchaseReverted",
                        "\"Type\" <> 'PurchaseReverted' OR \"PurchaseEventId\" IS NOT NULL"
                    );
                    table.CheckConstraint("CK_ProductEvents_Snoozed", "\"Type\" <> 'Snoozed' OR \"Days\" IS NOT NULL");
                    table.ForeignKey(
                        name: "FK_ProductEvents_Households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalTable: "Households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                    table.ForeignKey(
                        name: "FK_ProductEvents_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateIndex(
                name: "IX_ProductEvents_HouseholdId_ProductId_OccurredAt",
                table: "ProductEvents",
                columns: new[] { "HouseholdId", "ProductId", "OccurredAt" }
            );

            migrationBuilder.CreateIndex(name: "IX_ProductEvents_ProductId", table: "ProductEvents", column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_Products_HouseholdId_Name",
                table: "Products",
                columns: new[] { "HouseholdId", "Name" }
            );
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "ProductEvents");

            migrationBuilder.DropTable(name: "Products");

            migrationBuilder.DropColumn(name: "DefaultCurrency", table: "Households");

            migrationBuilder.DropColumn(name: "ShoppingDay", table: "Households");
        }
    }
}
