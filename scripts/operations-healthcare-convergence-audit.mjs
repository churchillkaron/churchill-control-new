import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function fail(message) {
  console.error(`HEALTHCARE_OPERATIONS_AUDIT_FAIL: ${message}`);
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

const operationsPage =
  "app/(system)/workspace/[organizationId]/operations/healthcare/page.jsx";
const healthcareRoot =
  "app/(system)/workspace/[organizationId]/healthcare/page.jsx";
const solutionRegistry =
  "lib/platform/solutions/OrganizationOperationalSolutionRegistry.js";

for (const route of [
  "/healthcare/dashboard",
  "/healthcare/appointments",
  "/healthcare/admissions",
  "/healthcare/beds",
  "/healthcare/pharmacy",
  "/healthcare/medical-records",
  "/operations/queue-entries",
  "/operations/assignments",
  "/operations/incidents",
]) {
  requireText(operationsPage, route);
}

requireText(
  solutionRegistry,
  "/workspace/:organizationId/operations/healthcare"
);

for (const route of [
  "/workspace/:organizationId/healthcare/appointments",
  "/workspace/:organizationId/healthcare/admissions",
  "/workspace/:organizationId/healthcare/beds",
  "/workspace/:organizationId/healthcare/pharmacy",
  "/workspace/:organizationId/healthcare/medical-records",
  "/workspace/:organizationId/healthcare/billing",
]) {
  requireText(solutionRegistry, route);
}

for (const child of [
  "appointments",
  "admissions",
  "medical-records",
  "pharmacy",
  "billing",
  "beds",
]) {
  requireText(healthcareRoot, `href: "${child}"`);
}

const operationsContent = read(operationsPage);

for (const prohibited of [
  "useAppointments(",
  "useAdmissions(",
  "useDashboard(",
  "supabase",
  "patient_id",
  "admission_date",
  "appointment_datetime",
]) {
  if (operationsContent.includes(prohibited)) {
    fail(`Operations Healthcare page duplicates clinical ownership via ${prohibited}`);
  }
}

if (!process.exitCode) {
  console.log("HEALTHCARE_OPERATIONS_CONVERGENCE_AUDIT_PASSED");
  console.log("HEALTHCARE_CLINICAL_OWNER=HEALTHCARE_DOMAIN");
  console.log("HEALTHCARE_COMMAND_OWNER=OPERATIONS_PRESENTATION");
  console.log("HEALTHCARE_CROSS_DOMAIN_CONTROLS=QUEUES_ASSIGNMENTS_INCIDENTS");
}
