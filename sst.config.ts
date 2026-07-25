/// <reference path="./.sst/platform/config.d.ts" />

/**
 * ComeRico infrastructure.
 *
 *   browser ──► Cloudflare Worker (TanStack Start SSR + /api/** proxy)
 *                      │                        │
 *                R2 (images)      Azure App Service F1 (.NET API) ──► Neon
 *
 * The Worker is the only public origin. `/api/**` is reverse-proxied to
 * Azure by frontend/src/routes/api.$.ts, which keeps the `__Host-` auth
 * cookie same-origin — no CORS, no SameSite=None.
 *
 * Everything here is on a free tier: Workers (100k req/day), R2, Neon free,
 * Azure App Service F1. State lives in R2 via `home: "cloudflare"`, so no
 * AWS account is involved.
 *
 * SST has no Azure components, so the App Service resources below are raw
 * Pulumi `azure-native`. Neon uses a community provider.
 */
export default $config({
  app(input) {
    return {
      name: "come-rico",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage ?? ""),
      home: "cloudflare",
      providers: {
        cloudflare: true,
        "azure-native": {
          location: process.env.AZURE_LOCATION ?? "eastus",
        },
        neon: true,
      },
    };
  },

  async run() {
    const azure = await import("@pulumi/azure-native");
    const neon = await import("@pulumi/neon");

    const isProd = $app.stage === "production";
    const prefix = `come-rico-${$app.stage}`;

    // ---- Secrets (sst secret set <Name> <value>) ----
    const cronSecret = new sst.Secret("CronSecret");

    // ---- Database (Neon) ----
    const neonProject = new neon.Project("Database", {
      name: prefix,
      // Free tier: single branch, scale-to-zero compute.
      historyRetentionSeconds: 0,
    });

    // The backend reads ConnectionStrings:DefaultConnection and does no URI
    // parsing, so this must be ADO.NET keyword=value form — a postgres://
    // URL will not work.
    const connectionString = $interpolate`Host=${neonProject.databaseHost};Port=5432;Database=${neonProject.databaseName};Username=${neonProject.databaseUser};Password=${neonProject.databasePassword};SSL Mode=Require;Trust Server Certificate=true`;

    // ---- Image storage (R2) ----
    // The backend talks to this over the S3-compatible API with explicit
    // credentials (AmazonS3Client), not a Worker binding, so the access
    // keys below are still required as app settings.
    const bucket = new sst.cloudflare.Bucket("Images");

    const r2AccessKeyId = new sst.Secret("R2AccessKeyId");
    const r2SecretAccessKey = new sst.Secret("R2SecretAccessKey");
    const r2PublicBaseUrl = new sst.Secret("R2PublicBaseUrl");
    const cloudflareAccountId = new sst.Secret("CloudflareAccountId");

    // ---- Backend (.NET on Azure App Service, free F1) ----
    const resourceGroup = new azure.resources.ResourceGroup("Backend", {
      resourceGroupName: prefix,
    });

    const plan = new azure.web.AppServicePlan("BackendPlan", {
      resourceGroupName: resourceGroup.name,
      name: `${prefix}-plan`,
      kind: "linux",
      reserved: true, // required for Linux
      sku: { name: "F1", tier: "Free" },
    });

    const api = new azure.web.WebApp("Api", {
      resourceGroupName: resourceGroup.name,
      name: `${prefix}-api`,
      serverFarmId: plan.id,
      httpsOnly: true,
      siteConfig: {
        // The backend is published self-contained, so it carries its own
        // .NET 10 runtime and the host stack version doesn't need to match
        // (.NET 10 is still Preview-tagged on App Service in some regions).
        appCommandLine: "./ComeRico.Api",
        alwaysOn: false, // not supported on F1
        appSettings: [
          { name: "ASPNETCORE_ENVIRONMENT", value: "Production" },
          { name: "ASPNETCORE_URLS", value: "http://0.0.0.0:8080" },
          { name: "WEBSITES_PORT", value: "8080" },
          { name: "ConnectionStrings__DefaultConnection", value: connectionString },
          {
            name: "R2__ServiceUrl",
            value: $interpolate`https://${cloudflareAccountId.value}.r2.cloudflarestorage.com`,
          },
          { name: "R2__AccessKeyId", value: r2AccessKeyId.value },
          { name: "R2__SecretAccessKey", value: r2SecretAccessKey.value },
          { name: "R2__BucketName", value: bucket.name },
          { name: "R2__PublicBaseUrl", value: r2PublicBaseUrl.value },
          { name: "CRON_SECRET", value: cronSecret.value },
        ],
      },
    });

    const backendUrl = $interpolate`https://${api.defaultHostName}`;

    // ---- Frontend (TanStack Start on Workers) ----
    const web = new sst.cloudflare.TanStackStart("Web", {
      path: "frontend",
      buildCommand: "pnpm build",
      link: [bucket],
      environment: {
        // Single source of truth for the backend's location: consumed both
        // by the /api/** proxy route and by the SSR calls in lib/api.ts.
        BACKEND_URL: backendUrl,
      },
    });

    // ---- Crons ----
    // Weekly orphaned-file GC. Goes through the Worker so it hits the same
    // origin a browser would; the endpoint authenticates on the bearer
    // secret rather than a user cookie.
    new sst.cloudflare.Cron("ImageCleanup", {
      schedules: ["0 0 * * 0"],
      job: {
        handler: "infra/cron/image-cleanup.ts",
        environment: {
          APP_URL: web.url,
          CRON_SECRET: cronSecret.value,
        },
      },
    });

    // App Service F1 has no "Always On" and sleeps after ~20 minutes idle,
    // which costs the next visitor a ~20-40s cold start. Pinging every 5
    // minutes keeps it warm for a negligible slice of the 60 CPU-min/day
    // budget. Production only — dev stages can cold-start.
    if (isProd) {
      new sst.cloudflare.Cron("KeepWarm", {
        schedules: ["*/5 * * * *"],
        job: {
          handler: "infra/cron/keep-warm.ts",
          environment: { BACKEND_URL: backendUrl },
        },
      });
    }

    return {
      url: web.url,
      api: backendUrl,
      bucket: bucket.name,
    };
  },
});
