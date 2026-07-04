using ComeRico.Api.Endpoints;
using ComeRico.Api.Extensions;
using ComeRico.Api.Hubs;
using ComeRico.Api.Services;
using ComeRico.Core.Features.Households.Commands;
using ComeRico.Core.Interfaces;
using ComeRico.Core.Persistence;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ---------- Services ----------

// EF Core + PostgreSQL
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());

// Tenant resolution (from HTTP header — swap for JWT claims in production)
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ITenantService, HttpTenantService>();

// MediatR — scans the ComeRico.Core assembly for handlers
builder.Services.AddMediatR(cfg =>
{
    cfg.RegisterServicesFromAssemblyContaining<CreateHouseholdCommand>();
    cfg.AddOpenBehavior(typeof(ValidationBehavior<,>));
});

// FluentValidation — scans the ComeRico.Core assembly for validators
builder.Services.AddValidatorsFromAssemblyContaining<CreateHouseholdCommand>();

// SignalR
builder.Services.AddSignalR();

// CORS — allow the Vite dev server during development
builder.Services.AddCors(options =>
{
    options.AddPolicy("ViteDev", policy =>
    {
        policy.WithOrigins(
                builder.Configuration.GetValue<string>("AllowedOrigins:ViteDev") ?? "http://localhost:3000")
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials(); // Required for SignalR WebSockets
    });
});

// Authorization policy that requires the X-Household-Id header to be resolvable
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("RequiresHousehold", policy =>
        policy.RequireAssertion(_ => true)); // Header-based; real auth would check JWT claims

// OpenAPI
builder.Services.AddOpenApi();

// ---------- App ----------

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

    // Auto-migrate in development for convenience
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
}

app.UseCors("ViteDev");

// Global exception handler for validation errors
app.UseExceptionHandler(exceptionApp =>
{
    exceptionApp.Run(async context =>
    {
        var exceptionFeature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
        if (exceptionFeature?.Error is FluentValidation.ValidationException validationEx)
        {
            context.Response.StatusCode = StatusCodes.Status422UnprocessableEntity;
            context.Response.ContentType = "application/json";
            var errors = validationEx.Errors.Select(e => new { field = e.PropertyName, message = e.ErrorMessage });
            await context.Response.WriteAsJsonAsync(new { errors });
        }
        else if (exceptionFeature?.Error is InvalidOperationException opEx)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new { message = opEx.Message });
        }
        else
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new { message = "Ocurrió un error interno. Por favor inténtelo de nuevo." });
        }
    });
});

app.UseAuthorization();

// Map endpoints
app.MapHouseholdEndpoints();
app.MapDishEndpoints();
app.MapRouletteEndpoints();

// SignalR hub — decoupled broadcast only
app.MapHub<RouletteHub>("/hubs/roulette");

app.Run();
