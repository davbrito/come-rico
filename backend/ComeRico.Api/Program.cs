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
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ---------- Services ----------

// EF Core + PostgreSQL (DATABASE_URL from Neon/Vercel, or DefaultConnection locally)
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(ConnectionStringResolver.Resolve(builder.Configuration))
        // False positive: the tenant query filters capture a scoped service, which makes
        // the runtime model never match the snapshot exactly. Migrations stay in sync via
        // `dotnet ef migrations add` (which compiles a design-time model without the closure).
        .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning)));

builder.Services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());

// Current user + tenant resolution from the auth cookie's claims
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ITenantService, ClaimsTenantService>();
builder.Services.AddScoped<ICurrentUserService, HttpCurrentUserService>();

// ASP.NET Core Identity — cookie-based auth (BFF pattern: the HttpOnly cookie is the
// session; no tokens are ever exposed to the browser).
builder.Services
    .AddIdentityCore<AppUser>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.Password.RequiredLength = 8;
        options.Password.RequireNonAlphanumeric = false;
        options.Password.RequireUppercase = false;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddSignInManager()
    .AddDefaultTokenProviders()
    .AddClaimsPrincipalFactory<AppUserClaimsPrincipalFactory>();

builder.Services
    .AddAuthentication(IdentityConstants.ApplicationScheme)
    .AddIdentityCookies();

builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "comerico.auth";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax; // CSRF baseline: blocks cross-site POSTs
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
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
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("RequiresHousehold", policy => policy
        .RequireAuthenticatedUser()
        .RequireClaim(AppClaimTypes.HouseholdId));

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

// SignalR hub — decoupled broadcast only
app.MapHub<RouletteHub>("/hubs/roulette");

app.Run();
