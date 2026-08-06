import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function fail(message) {
  console.error(`VENUE_OPERATIONS_AUDIT_FAIL: ${message}`);
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

const venuePage =
  "app/(system)/workspace/[organizationId]/operations/venue/page.jsx";
const legacyPage =
  "app/(system)/workspace/[organizationId]/entertainment/page.jsx";
const solutionRegistry =
  "lib/platform/solutions/OrganizationOperationalSolutionRegistry.js";

requireText(venuePage, "/operations/pos");
requireText(venuePage, "/operations/incidents");
requireText(venuePage, "/operations/queue-entries");
requireText(venuePage, "Operations owns");

requireText(legacyPage, "redirect(");
requireText(legacyPage, "/operations/venue");

requireText(
  solutionRegistry,
  "/workspace/:organizationId/operations/venue"
);
requireText(
  solutionRegistry,
  "/workspace/:organizationId/operations/pos"
);
requireText(
  solutionRegistry,
  "/workspace/:organizationId/operations/incidents"
);
requireText(
  solutionRegistry,
  "/workspace/:organizationId/operations/queue-entries"
);

const registryContent = read(solutionRegistry);

if (
  registryContent.includes(
    'route: "/workspace/:organizationId/entertainment"'
  )
) {
  fail("solution registry still routes Venue Control to legacy Entertainment");
}

const legacyContent = read(legacyPage);

for (const obsoleteLauncherToken of [
  "const modules =",
  "/entertainment/${module.href}",
  "Industry Workspace",
]) {
  if (legacyContent.includes(obsoleteLauncherToken)) {
    fail(`legacy Entertainment launcher still contains ${obsoleteLauncherToken}`);
  }
}

if (!process.exitCode) {
  console.log("VENUE_OPERATIONS_CONVERGENCE_AUDIT_PASSED");
  console.log("VENUE_CONTROL_OWNER=OPERATIONS");
  console.log("VENUE_POS_OWNER=UNIVERSAL_POS");
  console.log("VENUE_INCIDENT_OWNER=OPERATIONS_EVENT_ENGINE");
  console.log("VENUE_WORK_QUEUE_OWNER=OPERATIONS_EVENT_ENGINE");
}
