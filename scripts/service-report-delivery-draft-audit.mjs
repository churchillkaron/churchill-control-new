import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const runtimePath = "lib/service-management/runtime/ServiceReportDeliveryDraftRuntime.js";
const routePath = "app/api/service-management/reports/[occurrenceId]/delivery-draft/route.js";

const runtime = read(runtimePath);
const route = read(routePath);

requireMatch(
  runtime,
  /getCompletedServiceReport/,
  "Delivery draft must derive from the canonical completed-service report.",
);
requireMatch(
  runtime,
  /owner_domain:\s*["']commercial\.communications["']/,
  "Delivery ownership must remain with Commercial Communications.",
);
requireMatch(
  runtime,
  /requires_explicit_send_confirmation:\s*true/,
  "Customer delivery must require explicit send confirmation.",
);
requireMatch(
  runtime,
  /auto_send:\s*false/,
  "Delivery draft must never auto-send.",
);
requireMatch(
  runtime,
  /customer_signature/,
  "Customer signature evidence must be eligible for delivery attachment projection.",
);
requireMatch(
  runtime,
  /technician_signature/,
  "Technician signature evidence must be eligible for delivery attachment projection.",
);
requireMatch(
  route,
  /export async function GET/,
  "Delivery preparation route must remain read-only GET.",
);
requireMatch(
  route,
  /resolveServiceManagementContext/,
  "Delivery preparation route must use Service Management authorization context.",
);

if (/export async function (POST|PUT|PATCH|DELETE)/.test(route)) {
  throw new Error("Delivery preparation route must not expose a mutation method.");
}
if (/\.from\(|\.insert\(|\.update\(|\.delete\(/.test(runtime)) {
  throw new Error("Delivery draft runtime must not persist delivery or report state.");
}
if (/deliverCommunicationMessage|queueOutboundMessage|sendDraftMessage/.test(runtime + route)) {
  throw new Error("Service Management delivery preparation must not send Communications messages.");
}

console.log("SERVICE_REPORT_DELIVERY_DRAFT_AUDIT_PASSED");
console.log("SERVICE_REPORT_DELIVERY_SOURCE=CANONICAL_COMPLETED_SERVICE_REPORT");
console.log("SERVICE_REPORT_DELIVERY_STORAGE=NONE");
console.log("SERVICE_REPORT_DELIVERY_OWNER=COMMERCIAL_COMMUNICATIONS");
console.log("SERVICE_REPORT_DELIVERY_AUTO_SEND=FALSE");
