// @hey-api/openapi-ts@0.99 declares typescript as a peer (>=5.5.3) but uses the
// JS compiler API (ts.SyntaxKind, ...), which TypeScript 7 (native) does not
// ship. Give it its own TypeScript 6 until it supports 7; the workspace itself
// (tsc --noEmit) still runs on TypeScript 7. Remove once a stable release
// includes the fix: https://github.com/hey-api/hey-api/issues/4235
function readPackage(pkg) {
  if (pkg.name === "@hey-api/openapi-ts") {
    delete pkg.peerDependencies?.typescript;
    pkg.dependencies = { ...pkg.dependencies, typescript: "npm:typescript@^6.0.3" };
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
