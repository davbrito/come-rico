using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComeRico.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AppUserWorkOsUserId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "WorkOsUserId",
                table: "AspNetUsers",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_WorkOsUserId",
                table: "AspNetUsers",
                column: "WorkOsUserId",
                unique: true
            );
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_AspNetUsers_WorkOsUserId", table: "AspNetUsers");

            migrationBuilder.DropColumn(name: "WorkOsUserId", table: "AspNetUsers");
        }
    }
}
