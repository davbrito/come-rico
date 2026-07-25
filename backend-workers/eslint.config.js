import tseslint from "typescript-eslint";

// Isolation guardrail: business logic in src/features/** must go through the
// tenant-scoped DB handle (src/db/tenant.ts) and must never reach for the raw
// client or the schema tables directly. This is what enforces household
// isolation now that EF Core's global query filters are gone; the two-household
// contract tests are the runtime half of the same guarantee.
export default tseslint.config({
  files: ["src/features/**/*.ts"],
  languageOptions: {
    parser: tseslint.parser,
  },
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/db/client", "**/db/client.*", "**/db/schema", "**/db/schema.*"],
            message:
              "Features must not use the raw DB client or schema directly — accept a TenantDb (src/db/tenant.ts) so every query is household-scoped.",
          },
        ],
      },
    ],
  },
});
