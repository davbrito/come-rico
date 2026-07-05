using ComeRico.Api.Auth;
using ComeRico.Api.Endpoints;
using ComeRico.Api.Extensions;
using ComeRico.Api.Hubs;
using ComeRico.Api.Services;
using ComeRico.Core.Domain.Entities;
using ComeRico.Core.Features.Households.Commands;
using ComeRico.Core.Interfaces;
using ComeRico.Core.Persistence;
using FluentValidation;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ---------- Services ----------

// EF Core + PostgreSQL (DATABASE_URL from Neon/Vercel, or DefaultConnection locally)
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"))
);

builder.Services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());

// Enums travel as strings over the wire (MealType, MeasurementUnit) so the
// generated frontend client gets string literal unions instead of numbers.
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter())
);

// Current user + tenant resolution from the auth cookie's claims
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ITenantService, ClaimsTenantService>();
builder.Services.AddScoped<ICurrentUserService, HttpCurrentUserService>();
builder.Services.AddAuthorization();

// ASP.NET Core Identity API — supports both HttpOnly cookie (BFF/SPA) and bearer
// token (mobile/native) auth in a single setup.
builder
    .Services.AddIdentityApiEndpoints<AppUser>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.Password.RequiredLength = 8;
        options.Password.RequireNonAlphanumeric = false;
        options.Password.RequireUppercase = false;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddClaimsPrincipalFactory<AppUserClaimsPrincipalFactory>();

// Persist Data Protection keys in the shared database so auth cookies remain
// valid across container instances and restarts (in-memory keys caused random
// session loss in production).
builder.Services.AddDataProtection().SetApplicationName("ComeRico").PersistKeysToDbContext<AppDbContext>();

builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "__Host-comerico.auth";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax; // CSRF baseline: blocks cross-site POSTs
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromDays(14);
    options.SlidingExpiration = true;

    // API clients expect status codes, not redirects to a login page
    options.Events.OnRedirectToLogin = context =>
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    };
});

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

// Authorization: household-scoped endpoints require an authenticated user whose
// cookie carries a household claim (i.e. they created or joined a household).
builder
    .Services.AddAuthorizationBuilder()
    .AddPolicy("RequiresHousehold", policy => policy.RequireAuthenticatedUser().RequireClaim(AppClaimTypes.HouseholdId));

// OpenAPI
builder.Services.AddOpenApi();

// ---------- App ----------

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Migrations are applied exclusively via the dotnet CLI:
//   dotnet ef database update --project ComeRico.Core --startup-project ComeRico.Api
// The app never migrates the database itself.

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

app.UseAuthentication();
app.UseAuthorization();

// Map endpoints
app.MapAuthEndpoints();
app.MapHouseholdEndpoints();
app.MapDishEndpoints();
app.MapRouletteEndpoints();
app.MapTagEndpoints();
app.MapMealPlanEndpoints();
app.MapShoppingEndpoints();

// SignalR hub — decoupled broadcast only
app.MapHub<RouletteHub>("/hubs/roulette");

app.Run();
