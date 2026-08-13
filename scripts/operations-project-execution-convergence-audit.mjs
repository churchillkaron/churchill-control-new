import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function fail(message) {
  console.error(`PROJECT_OPERATIONS_AUDIT_FAIL: ${message}`);
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

const projectPage =
  "app/(system)/workspace/[organizationId]/operations/project-execution/page.jsx";
const legacyPage =
  "app/(system)/workspace/[organizationId]/construction/page.jsx";
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
  "/operations/dispatch",
  "/operations/assignments",
  "/operations/queue-entries",
  "/operations/incidents",
  "/operations/completion-evidence",
]) {
  requireText(projectPage, route);
}

requireText(legacyPage, "redirect(");
requireText(legacyPage, "/operations/project-execution");

for (const route of [
  "/workspace/:organizationId/operations/project-execution",
  "/workspace/:organizationId/operations/work-orders",
  "/workspace/:organizationId/operations/dispatch",
  "/workspace/:organizationId/operations/assignments",
  "/workspace/:organizationId/operations/incidents",
  "/workspace/:organizationId/operations/completion-evidence",
]) {
  requireText(solutionRegistry, route);
}

for (const capabilityId of [
  '"work-orders"',
  '"dispatch"',
  '"assignments"',
  '"queue-entries"',
  '"incidents"',
  '"completion-evidence"',
]) {
  requireText(operationsCatalog, capabilityId);
}

requireText(
  operationsWorkspaceRegistry,
  "CANONICAL_OPERATIONS_CAPABILITY_CATALOG"
);
requireText(
  operationsWorkspaceRegistry,
  "buildWorkspaceItem(capability"
);
requireText(
  operationsResolver,
  "OPERATIONS_WORKSPACE_REGISTRY"
);
requireText(
  operationsResolver,
  "getOperationsWorkspaceItem(value)"
);
requireText(
  operationsCatchAll,
  "getOperationsWorkspaceItem(capabilityId)"
);

const solutionContent = read(solutionRegistry);

if (
  solutionContent.includes(
    'route: "/workspace/:organizationId/construction"'
  )
) {
  fail("solution registry still routes Project Operations to legacy Construction");
}

const legacyContent = read(legacyPage);

for (const obsoleteLauncherToken of [
  "const modules =",
  "/construction/${module.href}",
  "Industry Workspace",
]) {
  if (legacyContent.includes(obsoleteLauncherToken)) {
    fail(`legacy Construction launcher still contains ${obsoleteLauncherToken}`);
  }
}

if (!process.exitCode) {
  console.log("PROJECT_OPERATIONS_CONVERGENCE_AUDIT_PASSED");
  console.log("PROJECT_EXECUTION_OWNER=OPERATIONS");
  console.log("PROJECT_WORK_ORDER_OWNER=CANONICAL_OPERATIONS_CATALOG");
  console.log("PROJECT_DISPATCH_OWNER=CANONICAL_OPERATIONS_CATALOG");
  console.log("PROJECT_COMPLETION_OWNER=CANONICAL_OPERATIONS_CATALOG");
  console.log("PROJECT_COMMERCIAL_BOUNDARY=PROJECTS_COMMERCIAL_SUPPLY_CHAIN_FINANCE");
}
