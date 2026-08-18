import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function fail(message) {
  console.error(`SERVICE_PROOF_OF_SERVICE_AUDIT_FAIL: ${message}`);
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
  if (!read(relativePath).includes(expected)) {
    fail(`${relativePath} missing ${JSON.stringify(expected)}`);
  }
}

const repository = "lib/service-management/repositories/ServiceProofOfServiceRepository.js";
const document = "lib/service-management/documents/ProofOfServiceReport.js";
const runtime = "lib/service-management/runtime/ProofOfServiceRuntime.js";
const route = "app/api/service-management/occurrences/[occurrenceId]/proof-of-service/route.js";
const page = "app/(system)/workspace/[organizationId]/operations/field-service/proof-of-service/page.jsx";

requireText(repository, '.from("service_plan_occurrences")');
requireText(repository, '.eq("organization_id", organization_id)');
requireText(repository, '.eq("status", "completed")');
requireText(document, 'report_type: "proof-of-service"');
requireText(document, "completion.material_movements");
requireText(document, "evidence.customer_signature");
requireText(document, "evidence.technician_signature");
requireText(document, "gps_included: false");
requireText(runtime, "getCompletedServiceOccurrence");
requireText(runtime, "createProofOfServiceReport");
requireText(route, "export async function GET");
requireText(route, "resolveServiceManagementContext");
requireText(route, "getProofOfServiceReport");
requireText(page, "Read-only customer service reports");
requireText(page, "deterministic read-only projection");

if (!process.exitCode) {
  console.log("SERVICE_PROOF_OF_SERVICE_AUDIT_PASSED");
  console.log("SERVICE_PROOF_OF_SERVICE_STORAGE=NONE");
  console.log("SERVICE_PROOF_OF_SERVICE_SOURCE=COMPLETED_SERVICE_OCCURRENCE");
  console.log("SERVICE_PROOF_OF_SERVICE_MODE=READ_ONLY_PROJECTION");
  console.log("SERVICE_PROOF_OF_SERVICE_GPS=DEFERRED_UNTIL_PROJECTED");
}
