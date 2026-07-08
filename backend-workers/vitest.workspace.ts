// Two vitest projects: the workerd pool (unit/wiring tests) and a Node project
// for DB-backed contract tests against embedded PGlite.
export default ["./vitest.config.ts", "./vitest.node.config.ts"];
