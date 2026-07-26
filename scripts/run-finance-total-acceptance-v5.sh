#!/usr/bin/env bash

set -u

PROJECT_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
BASE_LAUNCHER="$PROJECT_ROOT/scripts/run-finance-total-acceptance.sh"
BASE_ORCHESTRATOR="$PROJECT_ROOT/scripts/finance-total-acceptance.mjs"
CACHE_DIR="$PROJECT_ROOT/.next/cache"
TEMP_LAUNCHER="$CACHE_DIR/avantiqo-finance-total-acceptance-v5-$$.sh"
TEMP_ORCHESTRATOR="$CACHE_DIR/avantiqo-finance-total-acceptance-v5-$$.mjs"

cleanup() {
  rm -f "$TEMP_LAUNCHER" "$TEMP_ORCHESTRATOR"
}
trap cleanup EXIT INT TERM

cd "$PROJECT_ROOT" || exit 1
mkdir -p "$CACHE_DIR" || exit 1

for required in "$BASE_LAUNCHER" "$BASE_ORCHESTRATOR"; do
  if [ ! -f "$required" ]; then
    echo "Missing required file: $required"
    exit 1
  fi
done

node - "$BASE_ORCHESTRATOR" "$TEMP_ORCHESTRATOR" <<'NODE'
const fs = require("fs");
const sourcePath = process.argv[2];
const targetPath = process.argv[3];
let source = fs.readFileSync(sourcePath, "utf8");

const parserStart = source.indexOf("function financeWorkspaceSection");
const parserEnd = source.indexOf("function parseOperationalEndpoints", parserStart);
if (parserStart < 0 || parserEnd < 0) {
  throw new Error("Unable to locate Finance parser block");
}

const parser = String.raw`function financeWorkspaceSection(registry) {
  const workspacesStart = registry.indexOf("workspaces: {");
  if (workspacesStart < 0) return "";
  const start = registry.indexOf("\n    finance: {", workspacesStart);
  if (start < 0) return "";
  const end = registry.indexOf("\n    people:", start);
  return end > start ? registry.slice(start, end) : registry.slice(start);
}

function parsePrimaryActionIds(policy) {
  return [...policy.matchAll(/^  ([a-z0-9_]+):/gm)].map((match) => match[1]);
}

function parseFinanceRoutes(registry, policyIds) {
  const section = financeWorkspaceSection(registry);
  const routes = [];

  for (const id of policyIds) {
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      "\\bid:\\s*[\\\"']" + escapedId + "[\\\"'][\\s\\S]{0,6000}?\\broute:\\s*[\\\"'](\\/finance(?:\\/[^\\\"']*)?)[\\\"']"
    );
    const match = section.match(pattern);
    if (match) routes.push({ id, route: match[1] });
  }

  return routes;
}

`;

source = source.slice(0, parserStart) + parser + source.slice(parserEnd);

const routeCallBefore = "  const routes = parseFinanceRoutes(registry);\n  const endpoints = parseOperationalEndpoints(policy);";
const routeCallAfter = "  const policyIds = parsePrimaryActionIds(policy);\n  const routes = parseFinanceRoutes(registry, policyIds);\n  const endpoints = parseOperationalEndpoints(policy);\n  const missingRouteIds = policyIds.filter((id) => !routes.some((route) => route.id === id));";
if (!source.includes(routeCallBefore)) throw new Error("Unable to patch route invocation");
source = source.replace(routeCallBefore, routeCallAfter);

const registryStart = source.indexOf('  add("registry", "Finance routes discovered"');
const formsStart = source.indexOf('  add("forms", "No fixed Finance defaults"', registryStart);
if (registryStart < 0 || formsStart < 0) throw new Error("Unable to patch registry assertions");
const registryAssertions = `  add("registry", "Finance routes discovered", routes.length === 67 && missingRouteIds.length === 0, {
    actual: routes.length,
    expected: 67,
    missingRouteIds,
  });
  add("registry", "Primary action policies", policyIds.length === 67, {
    actual: policyIds.length,
    expected: 67,
  });
`;
source = source.slice(0, registryStart) + registryAssertions + source.slice(formsStart);

source = source.replace(
  'supabase.rpc("finance_run_total_acceptance_probe_v2"',
  'supabase.rpc("finance_run_total_acceptance_probe_v4"'
);

for (const expected of [
  "parsePrimaryActionIds",
  "routes.length === 67",
  "finance_run_total_acceptance_probe_v4",
]) {
  if (!source.includes(expected)) throw new Error(`Orchestrator v5 patch missing: ${expected}`);
}

fs.writeFileSync(targetPath, source, { mode: 0o700 });
NODE

node --check "$TEMP_ORCHESTRATOR" || exit 1

node - "$BASE_LAUNCHER" "$TEMP_LAUNCHER" "$TEMP_ORCHESTRATOR" <<'NODE'
const fs = require("fs");
const sourcePath = process.argv[2];
const targetPath = process.argv[3];
const orchestratorPath = process.argv[4];
let source = fs.readFileSync(sourcePath, "utf8");

source = source
  .replaceAll(
    "20260726103000_finance_total_acceptance_probe_v2.sql",
    "20260726113000_finance_total_acceptance_repair.sql"
  )
  .replaceAll("20260726103000", "20260726113000")
  .replaceAll("Acceptance probe v2", "Acceptance repair v5")
  .replaceAll("acceptance probe v2", "acceptance repair v5")
  .replaceAll("Acceptance migration v2", "Acceptance repair migration v5")
  .replaceAll("acceptance migration v2", "acceptance repair migration v5")
  .replace(
    "node scripts/finance-total-acceptance.mjs",
    `node ${JSON.stringify(orchestratorPath)}`
  );

for (const expected of [
  "20260726113000_finance_total_acceptance_repair.sql",
  "20260726113000",
  orchestratorPath,
]) {
  if (!source.includes(expected)) throw new Error(`Launcher v5 patch missing: ${expected}`);
}

for (const obsolete of [
  "20260726103000_finance_total_acceptance_probe_v2.sql",
  "Dry run did not show the expected acceptance migration v2",
]) {
  if (source.includes(obsolete)) throw new Error(`Launcher v5 still contains obsolete gate: ${obsolete}`);
}

fs.writeFileSync(targetPath, source, { mode: 0o700 });
NODE

bash -n "$TEMP_LAUNCHER" || exit 1
bash "$TEMP_LAUNCHER"
