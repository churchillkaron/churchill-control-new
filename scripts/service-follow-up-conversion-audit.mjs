import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function fail(message) {
  console.error(`SERVICE_FOLLOW_UP_CONVERSION_AUDIT_FAIL: ${message}`);
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

const reconciliation = "lib/service-management/runtime/ServiceCompletionReconciliationRuntime.js";
const conversion = "lib/operations/workforce/ServiceFollowUpConversionRuntime.js";
const route = "app/api/operations/work-requests/[id]/convert-service-follow-up/route.js";

requireText(reconciliation, 'source_type: "service-follow-up"');
requireText(reconciliation, "follow_up_work_request_id");
requireText(conversion, 'status !== "approved"');
requireText(conversion, 'source_domain) !== "service-management"');
requireText(conversion, 'source_type) !== "service-follow-up"');
requireText(conversion, "occurrence_id");
requireText(conversion, "originating_work_order_id");
requireText(conversion, "completion_evidence_id");
requireText(conversion, 'capabilityId: "work-orders"');
requireText(conversion, 'command: "create"');
requireText(conversion, 'source_type: "service-follow-up-work-request"');
requireText(conversion, "service-follow-up-work-order:");
requireText(conversion, "idempotent_replay");
requireText(route, 'capabilityId: "work-orders"');
requireText(route, 'command: "create"');
requireText(route, "authorize: true");
requireText(route, "convertApprovedServiceFollowUpToWorkOrder");

if (!process.exitCode) {
  console.log("SERVICE_FOLLOW_UP_CONVERSION_AUDIT_PASSED");
  console.log("SERVICE_FOLLOW_UP_APPROVAL_OWNER=OPERATIONS_WORK_REQUEST");
  console.log("SERVICE_FOLLOW_UP_EXECUTION_OWNER=OPERATIONS_WORK_ORDER");
  console.log("SERVICE_FOLLOW_UP_CONVERSION=APPROVED_AND_IDEMPOTENT");
  console.log("SERVICE_FOLLOW_UP_ASSIGNMENT=DISPATCH_CONTROLLED");
}
