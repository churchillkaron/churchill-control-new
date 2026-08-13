import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function fail(message) {
  console.error(`HOTEL_OPERATIONS_AUDIT_FAIL: ${message}`);
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

function requireMissing(relativePath) {
  if (fs.existsSync(path.join(root, relativePath))) {
    fail(`obsolete owner still exists: ${relativePath}`);
  }
}

const operationsPages = [
  "app/(system)/workspace/[organizationId]/operations/hotel/page.jsx",
  "app/(system)/workspace/[organizationId]/operations/reservations/page.jsx",
  "app/(system)/workspace/[organizationId]/operations/front-desk/page.jsx",
  "app/(system)/workspace/[organizationId]/operations/housekeeping/page.jsx",
  "app/(system)/workspace/[organizationId]/operations/maintenance/page.jsx",
  "app/(system)/workspace/[organizationId]/operations/concierge/page.jsx",
];

for (const relativePath of operationsPages) {
  read(relativePath);
}

const legacyRedirects = [
  ["app/(system)/workspace/[organizationId]/hotel/page.jsx", "/operations/hotel"],
  ["app/(system)/workspace/[organizationId]/hotel/reservations/page.jsx", "/operations/reservations"],
  ["app/(system)/workspace/[organizationId]/hotel/frontdesk/page.jsx", "/operations/front-desk"],
  ["app/(system)/workspace/[organizationId]/hotel/housekeeping/page.jsx", "/operations/housekeeping"],
  ["app/(system)/workspace/[organizationId]/hotel/maintenance/page.jsx", "/operations/maintenance"],
  ["app/(system)/workspace/[organizationId]/hotel/concierge/page.jsx", "/operations/concierge"],
];

for (const [relativePath, route] of legacyRedirects) {
  requireText(relativePath, "redirect(");
  requireText(relativePath, route);
}

const solutionRegistry =
  "lib/platform/solutions/OrganizationOperationalSolutionRegistry.js";

for (const route of [
  "/workspace/:organizationId/operations/hotel",
  "/workspace/:organizationId/operations/front-desk",
  "/workspace/:organizationId/operations/reservations",
  "/workspace/:organizationId/operations/housekeeping",
  "/workspace/:organizationId/operations/maintenance",
  "/workspace/:organizationId/operations/concierge",
]) {
  requireText(solutionRegistry, route);
}

for (const obsoleteRoute of [
  "/workspace/:organizationId/hotel\"",
  "/workspace/:organizationId/hotel/frontdesk",
  "/workspace/:organizationId/hotel/reservations",
  "/workspace/:organizationId/hotel/housekeeping",
  "/workspace/:organizationId/hotel/maintenance",
  "/workspace/:organizationId/hotel/concierge",
]) {
  const registryContent = read(solutionRegistry);

  if (registryContent.includes(obsoleteRoute)) {
    fail(`solution registry still contains ${obsoleteRoute}`);
  }
}

for (const service of [
  "lib/hotel/checkInGuest.js",
  "lib/hotel/checkOutGuest.js",
  "lib/hotel/createConciergeRequest.js",
  "lib/operations/maintenance/createMaintenanceTask.js",
]) {
  requireMissing(service);
}

for (const service of [
  "lib/hotel/server/transitionHotelBooking.js",
  "lib/hotel/server/transitionHousekeepingTask.js",
  "lib/hotel/server/createHotelMaintenanceTask.js",
  "lib/hotel/server/transitionHotelMaintenanceTask.js",
  "lib/hotel/server/createHotelConciergeRequest.js",
  "lib/hotel/server/transitionHotelConciergeRequest.js",
]) {
  requireText(service, "organizationId");
  requireText(service, "organization_id");
}

if (!process.exitCode) {
  console.log("HOTEL_OPERATIONS_CONVERGENCE_AUDIT_PASSED");
  console.log("HOTEL_OPERATIONS_OWNER=OPERATIONS_APPLICATION_WORKSPACES");
  console.log("HOTEL_LEGACY_ROUTES=REDIRECT_ONLY");
  console.log("HOTEL_SERVER_TRANSITIONS=ORGANIZATION_SCOPED");
}
