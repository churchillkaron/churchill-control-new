import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://audit.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { buildOrganizationSystemHealthSnapshot } = await import(
  "@/lib/health/OrganizationSystemHealthRuntime"
);
const { normalizeOperatorProjectState } = await import(
  "@/lib/operator/contracts/OperatorProjectState"
);
const { listOperatorCapabilities } = await import(
  "@/lib/operator/runtime/OperatorCapabilityCatalog"
);

const healthyInputs = {
  organizationId: "organization-a",
  database: { status: "healthy", latency_ms: 12 },
  operations: {
    ok: true,
    status: "healthy",
    capability_count: 91,
    blocking_failures: [],
    warnings: [],
  },
  communications: {
    status: "healthy",
    failed_count: 0,
    stuck_count: 0,
    pending_count: 0,
    exceptions: [],
  },
  creative: {
    status: "healthy",
    failed_count: 0,
    stuck_count: 0,
    running_count: 0,
    exceptions: [],
  },
  capabilities: [
    { domain: "platform", mode: "read" },
    { domain: "operations", mode: "write" },
  ],
};

const healthy = buildOrganizationSystemHealthSnapshot(healthyInputs);
assert.equal(healthy.status, "healthy");
assert.equal(healthy.organization_id, "organization-a");
assert.equal(healthy.repair_execution_authorized, false);
assert.equal(healthy.verification_required_after_repair, false);
assert.equal(healthy.probes.execution_catalog.capability_count, 2);

const degraded = buildOrganizationSystemHealthSnapshot({
  ...healthyInputs,
  communications: {
    status: "degraded",
    failed_count: 1,
    stuck_count: 1,
    pending_count: 0,
    exceptions: [{ message_id: "message-a" }],
  },
});
assert.equal(degraded.status, "degraded");
assert.equal(degraded.verification_required_after_repair, true);
assert.equal(
  degraded.diagnoses[0].code,
  "COMMUNICATION_DELIVERY_DEGRADED",
);
assert.equal(degraded.diagnoses[0].automatic_repair_authorized, false);
assert.equal(
  degraded.recommended_incident_capability,
  "operations.incidents.create",
);

const unavailable = buildOrganizationSystemHealthSnapshot({
  ...healthyInputs,
  database: { status: "unhealthy" },
  operations: {
    ok: false,
    status: "unavailable",
    blocking_failures: [{ key: "execute_operations_command" }],
    warnings: [],
  },
});
assert.equal(unavailable.status, "unavailable");
assert.equal(unavailable.safe_to_execute_writes, false);
assert.deepEqual(
  unavailable.diagnoses.map((item) => item.code),
  ["DATABASE_UNAVAILABLE", "OPERATIONS_READINESS_BLOCKED"],
);

const remembered = normalizeOperatorProjectState({
  objective: "Restore Avantiqo health",
  status: "active",
  last_system_snapshot: {
    snapshot_id: degraded.snapshot_id,
    phase: degraded.phase,
    status: degraded.status,
    checked_at: degraded.checked_at,
    diagnosis_codes: degraded.diagnoses.map((item) => item.code),
    verification_required: true,
  },
});
assert.equal(remembered.last_system_snapshot.snapshot_id, degraded.snapshot_id);
assert.equal(remembered.last_system_snapshot.status, "degraded");
assert.deepEqual(remembered.last_system_snapshot.diagnosis_codes, [
  "COMMUNICATION_DELIVERY_DEGRADED",
]);

const catalog = await listOperatorCapabilities();
const inspect = catalog.find(
  (capability) => capability.key === "platform.system.inspectHealth",
);
const verify = catalog.find(
  (capability) => capability.key === "platform.system.verifyHealth",
);
assert.ok(inspect, "System health inspection must be Operator-visible");
assert.ok(verify, "System health verification must be Operator-visible");

for (const capability of [inspect, verify]) {
  assert.equal(capability.mode, "read");
  assert.equal(capability.risk, "low");
  assert.equal(capability.auto_execute, true);
  assert.equal(capability.requires_confirmation, false);
  assert.deepEqual(capability.permissions, ["platform.system.health.view"]);
}

const [
  databaseHealthSource,
  communicationRepositorySource,
  creativeRepositorySource,
  healthCapabilitySource,
  reasoningSource,
  routeSource,
] = await Promise.all([
  readFile("lib/health/checkDatabaseHealth.js", "utf8"),
  readFile("lib/commercial/communications/CommunicationRepository.js", "utf8"),
  readFile(
    "lib/operations/tasks/repositories/ProductionTaskRepository.js",
    "utf8",
  ),
  readFile("lib/platform/capabilities/createSystemHealthCapability.js", "utf8"),
  readFile("lib/operator/runtime/OperatorReasoningRuntime.js", "utf8"),
  readFile("app/api/operator/turn/route.js", "utf8"),
]);

assert.match(databaseHealthSource, /\.eq\("id", organizationId\)/);
assert.match(
  communicationRepositorySource,
  /listDeliveryExceptions[\s\S]*\.eq\("organization_id", organizationId\)/,
);
assert.match(
  creativeRepositorySource,
  /listOrganizationTaskExceptions[\s\S]*\.eq\("organization_id", organization_id\)/,
);
assert.doesNotMatch(
  healthCapabilitySource,
  /\.insert\(|\.update\(|\.delete\(|executeService|CreativePublish/,
);
assert.match(reasoningSource, /inspect, diagnose, propose/);
assert.match(reasoningSource, /health verification before claiming/);
assert.match(routeSource, /last_system_snapshot/);

console.log("OPERATOR_SYSTEM_MANAGEMENT_AUDIT=PASS");
console.log("SYSTEM_MANAGEMENT_LOOP=INSPECT_DIAGNOSE_CONFIRM_EXECUTE_VERIFY");
console.log("SYSTEM_HEALTH_SCOPE=ORGANIZATION");
console.log("SYSTEM_REPAIR_DEFAULT=NOT_AUTHORIZED");
console.log("SYSTEM_EXTERNAL_RETRY_DEFAULT=FORBIDDEN");
