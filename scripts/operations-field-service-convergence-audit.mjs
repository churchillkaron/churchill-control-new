import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function fail(message) {
  console.error(`FIELD_SERVICE_OPERATIONS_AUDIT_FAIL: ${message}`);
  process.exitCode = 1;
}

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);

  if (!fs.existsSync(absolutePath)) {
    fail(`missing ${relativePath}`);
    return "";
  }

  return fs.readFileSync(absolutePath, "utf8");
}

function requireText(relativePath, expected) {
  const content = read(relativePath);

  if (!content.includes(expected)) {
    fail(`${relativePath} missing ${JSON.stringify(expected)}`);
  }
}

const fieldServicePage =
  "app/(system)/workspace/[organizationId]/operations/field-service/page.jsx";
const legacyPage =
  "app/(system)/workspace/[organizationId]/pest_control/page.jsx";
const solutionRegistry =
  "lib/platform/solutions/OrganizationOperationalSolutionRegistry.js";
const operationsCatalog =
  "lib/operations/runtime/OperationsCapabilityCatalog.js";
const operationsWorkspaceRegistry =
  "lib/operations/registry/OperationsWorkspaceRegistry.js";
const operationsResolver =
  "lib/operations/registry/OperationsWorkspaceResolver.js";
const operationsCatchAll =
  "app/(system)/workspace/[organizationId]/operations/[...operationsRoute]/page.jsx";

for (const route of [
  "/operations/work-orders",
  "/operations/appointment-windows",
  "/operations/dispatch",
  "/operations/assignments",
  "/operations/queue-entries",
  "/operations/completion-evidence",
]) {
  requireText(fieldServicePage, route);
}

for (const boundary of [
  "contracts",
  "treatments",
  "chemicals",
  "customers",
  "billing",
  "recurring-service rules",
]) {
  requireText(fieldServicePage, boundary);
}

requireText(legacyPage, "redirect(");
requireText(legacyPage, "/operations/field-service");
requireText(
  solutionRegistry,
  "/workspace/:organizationId/operations/field-service"
);

for (const capabilityId of [
  '"work-orders"',
  '"appointment-windows"',
  '"dispatch"',
  '"assignments"',
  '"queue-entries"',
  '"completion-evidence"',
]) {
  requireText(operationsCatalog, capabilityId);
}

requireText(
  operationsWorkspaceRegistry,
  "CANONICAL_OPERATIONS_CAPABILITY_CATALOG"
);
requireText(
  operationsResolver,
  "OPERATIONS_WORKSPACE_REGISTRY"
);
requireText(
  operationsCatchAll,
  "getOperationsWorkspaceItem(capabilityId)"
);

const registryContent = read(solutionRegistry);

if (
  registryContent.includes(
    'route: "/workspace/:organizationId/pest_control"'
  )
) {
  fail("solution registry still routes Service Control to legacy Pest Control");
}

const legacyContent = read(legacyPage);

for (const obsoleteLauncherToken of [
  "const modules =",
  "/pest_control/${module.href}",
  "Industry Workspace",
]) {
  if (legacyContent.includes(obsoleteLauncherToken)) {
    fail(`legacy Pest Control launcher still contains ${obsoleteLauncherToken}`);
  }
}

if (!process.exitCode) {
  console.log("FIELD_SERVICE_OPERATIONS_CONVERGENCE_AUDIT_PASSED");
  console.log("FIELD_SERVICE_COMMAND_OWNER=OPERATIONS");
  console.log("FIELD_SERVICE_EXECUTION_OWNER=CANONICAL_OPERATIONS_CATALOG");
  console.log("FIELD_SERVICE_BUSINESS_RULES_OWNER=SERVICE_DOMAIN");
  console.log("FIELD_SERVICE_INVENTORY_OWNER=SUPPLY_CHAIN");
  console.log("FIELD_SERVICE_BILLING_OWNER=FINANCE");
}
