using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComeRico.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DropRouletteSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "RouletteSessions");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RouletteSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    WinnerDishId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SpunAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RouletteSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RouletteSessions_Dishes_WinnerDishId",
                        column: x => x.WinnerDishId,
                        principalTable: "Dishes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict
                    );
                    table.ForeignKey(
                        name: "FK_RouletteSessions_Households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalTable: "Households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateIndex(
                name: "IX_RouletteSessions_HouseholdId",
                table: "RouletteSessions",
                column: "HouseholdId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_RouletteSessions_WinnerDishId",
                table: "RouletteSessions",
                column: "WinnerDishId"
            );
        }
    }
}
