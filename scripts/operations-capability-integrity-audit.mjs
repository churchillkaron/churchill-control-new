import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const FILES = Object.freeze({
  baseCatalog: "lib/operations/runtime/OperationsCapabilityCatalog.js",
  commerceCatalog: "lib/operations/runtime/CommerceCapabilityCatalog.js",
  canonicalCatalog: "lib/operations/runtime/CanonicalOperationsCapabilityCatalog.js",
  handlers: "lib/operations/runtime/CanonicalOperationsHandlers.js",
  repositories: "lib/operations/repositories/CanonicalOperationsRepositories.js",
  repositoryRegistry: "lib/operations/repositories/OperationsRepositoryRegistry.js",
  api: "lib/operations/api/OperationsApiController.js",
  lifecycle: "lib/operations/runtime/OperationsLifecyclePolicy.js",
  readiness: "lib/operations/readiness/OperationsReadinessService.js",
  workspaceRegistry: "lib/operations/registry/OperationsWorkspaceRegistry.js",
  formSchemas: "lib/operations/forms/OperationsFormSchemaRegistry.js",
  commandSchemas: "lib/operations/forms/OperationsCommandSchemaRegistry.js",
  migration: "supabase/migrations/20260805093000_operations_canonical_capability_convergence.sql",
});

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing Operations integrity file: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function requireIncludes(source, values, label) {
  for (const value of values) {
    if (!source.includes(value)) {
      throw new Error(`${label} is missing required contract: ${value}`);
    }
  }
}

function requireExcludes(source, values, label) {
  const lower = source.toLowerCase();
  for (const value of values) {
    if (lower.includes(value.toLowerCase())) {
      throw new Error(`${label} contains forbidden industry contract: ${value}`);
    }
  }
}

const source = Object.fromEntries(
  Object.entries(FILES).map(([key, file]) => [key, read(file)]),
);

const baseIds = [...source.baseCatalog.matchAll(/^\s*\["([^"]+)",\s*"[^"]+"/gm)]
  .map((match) => match[1]);
const commerceIds = [...source.commerceCatalog.matchAll(/id:\s*"([^"]+)"/g)]
  .map((match) => match[1]);
const canonicalIds = [...new Set([...baseIds, ...commerceIds])];
const duplicates = canonicalIds.filter((id, index, values) => values.indexOf(id) !== index);

if (duplicates.length) {
  throw new Error(`Duplicate canonical Operations capability ids: ${duplicates.join(", ")}`);
}
if (baseIds.length < 80) {
  throw new Error(`Operations base catalogue unexpectedly contains ${baseIds.length} capabilities.`);
}
if (commerceIds.length !== 6) {
  throw new Error(`Operations commerce catalogue unexpectedly contains ${commerceIds.length} capabilities.`);
}
if (canonicalIds.length !== baseIds.length + commerceIds.length) {
  throw new Error("Canonical Operations capability count is inconsistent.");
}

requireIncludes(source.canonicalCatalog, [
  "OPERATIONS_CAPABILITY_CATALOG",
  "OPERATIONS_COMMERCE_CAPABILITY_CATALOG",
  "CANONICAL_OPERATIONS_CAPABILITY_CATALOG",
  "Duplicate Operations capability ids",
], "Canonical Operations catalogue");

for (const [label, key] of [
  ["Canonical handlers", "handlers"],
  ["Canonical repositories", "repositories"],
  ["Repository registry", "repositoryRegistry"],
  ["Readiness service", "readiness"],
]) {
  requireIncludes(source[key], [
    "CANONICAL_OPERATIONS_CAPABILITY_CATALOG",
  ], label);
}

requireIncludes(source.api, [
  "getCanonicalOperationsCapability",
], "Operations API");

requireIncludes(source.lifecycle, [
  "commerce:",
  "OPERATIONS_CREATE_COMMANDS",
  "isOperationsCreateCommand",
  'configure: "inactive"',
  'prepare: "prepared"',
  'issue: "issued"',
  'open: "open"',
  'dispatch: "dispatched"',
  "allocate",
  "authorize",
  "capture",
  "refund",
  "reconcile",
  "redispatch",
], "Operations lifecycle policy");

requireIncludes(source.migration, [
  "operations_lifecycle_initial_status",
  "operations_lifecycle_target_status",
  "v_lifecycle = 'commerce'",
  "execute_operations_command",
  "'configure', 'prepare', 'issue', 'open', 'dispatch'",
  "operations_event_outbox",
], "Operations convergence migration");

requireIncludes(source.workspaceRegistry, [
  "CANONICAL_OPERATIONS_CAPABILITY_CATALOG",
  "commerce-execution",
  "Industry-neutral commerce and work execution",
], "Operations workspace registry");

const GENERIC_CORE_FORBIDDEN = [
  "restaurant",
  "waiter",
  "kitchen",
  "hotel",
  "housekeeping",
  "pest control",
  "salon",
  "clinic",
];

for (const [label, key] of [
  ["Base capability catalogue", "baseCatalog"],
  ["Canonical capability catalogue", "canonicalCatalog"],
  ["Canonical handlers", "handlers"],
  ["Canonical repositories", "repositories"],
  ["Repository registry", "repositoryRegistry"],
  ["Operations API", "api"],
  ["Operations lifecycle policy", "lifecycle"],
  ["Operations form schemas", "formSchemas"],
  ["Operations command schemas", "commandSchemas"],
]) {
  requireExcludes(source[key], GENERIC_CORE_FORBIDDEN, label);
}

for (const [label, contents] of Object.entries(source)) {
  requireExcludes(contents, ["tenant_id", "tenantId"], `Operations ${label}`);
}

console.log("OPERATIONS_CAPABILITY_INTEGRITY_AUDIT=PASS");
console.log(`OPERATIONS_BASE_CAPABILITY_COUNT=${baseIds.length}`);
console.log(`OPERATIONS_COMMERCE_CAPABILITY_COUNT=${commerceIds.length}`);
console.log(`OPERATIONS_CANONICAL_CAPABILITY_COUNT=${canonicalIds.length}`);
console.log("OPERATIONS_EXECUTION_LAYERS=CANONICAL_CATALOG_ALIGNED");
console.log("OPERATIONS_COMMERCE_LIFECYCLE=GOVERNED");
console.log("OPERATIONS_GENERIC_CORE=INDUSTRY_NEUTRAL");
