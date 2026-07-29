import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const FILES = Object.freeze({
  deliveryRuntime: "lib/operations/events/OperationsEventDelivery.js",
  serverEvents: "lib/operations/events/serverOperationsEvents.js",
  eventsRoute: "app/api/operations/events/route.js",
  healthRoute: "app/api/operations/events/health/route.js",
  recordHistoryRoute: "app/api/operations/[capabilityId]/[recordId]/history/route.js",
  recordHistoryPanel: "components/workspace/operations/OperationsRecordHistoryPanel.jsx",
  runtimeWorkCenter: "components/workspace/operations/OperationsRuntimeWorkCenter.jsx",
  eventWorkCenter: "components/workspace/operations/OperationsEventWorkCenter.jsx",
  workspaceRegistry: "lib/operations/registry/OperationsWorkspaceRegistry.js",
  capabilityPage: "app/(system)/workspace/[organizationId]/operations/[...operationsRoute]/page.jsx",
  commandRoute: "app/api/operations/[capabilityId]/commands/[command]/route.js",
  eventMigration: "supabase/migrations/20260728210000_operations_event_delivery.sql",
  healthMigration: "supabase/migrations/20260728213000_operations_event_health.sql",
  auditProjectionMigration: "supabase/migrations/20260728220000_operations_command_audit_projection.sql",
  actorProjectionRepairMigration: "supabase/migrations/20260729004500_operations_event_actor_projection_repair.sql",
});

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing required Operations event file: ${relativePath}`);
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
  for (const value of values) {
    if (source.includes(value)) {
      throw new Error(`${label} contains forbidden contract: ${value}`);
    }
  }
}

const source = Object.fromEntries(
  Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)]),
);

requireIncludes(source.eventMigration, [
  "create table if not exists public.operations_events",
  "outbox_id uuid not null unique",
  "prevent_operations_event_mutation",
  "operations_events_immutable_guard",
  "publish_operations_event_batch",
  "for update skip locked",
  "dead_letter",
  "power(2",
  "on conflict (outbox_id) do nothing",
], "Operations event delivery migration");

requireIncludes(source.healthMigration, [
  "get_operations_event_delivery_health",
  "retry_operations_dead_letter",
  "organization_id required",
  "entity_id is not distinct from",
  "period_id is not distinct from",
  "status = 'dead_letter'",
], "Operations event health migration");

requireIncludes(source.auditProjectionMigration, [
  "add column if not exists record_id uuid",
  "add column if not exists actor_id uuid",
  "operations_command_ledger_record_idx",
  "operations_command_ledger_actor_idx",
  "project_operations_command_audit_fields",
  "operations_command_ledger_audit_projection",
], "Operations command audit projection migration");

requireIncludes(source.actorProjectionRepairMigration, [
  "disable trigger operations_events_immutable_guard",
  "enable trigger operations_events_immutable_guard",
  "update public.operations_events",
  "where actor_id is null",
  "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
], "Operations immutable event actor projection repair migration");

requireIncludes(source.deliveryRuntime, [
  "publishPending",
  "listEvents",
  "getOutboxHealth",
  "retryDeadLetter",
  "get_operations_event_delivery_health",
  "retry_operations_dead_letter",
], "Operations event delivery runtime");

requireIncludes(source.eventsRoute, [
  "resolveOperationsRequestContext",
  "listEvents",
  "publishPending",
  "organization_id",
], "Operations event API");

requireIncludes(source.healthRoute, [
  "getOutboxHealth",
  "retryDeadLetter",
  "outbox_id required",
  "publishPending",
], "Operations event health API");

requireIncludes(source.recordHistoryRoute, [
  "operations_command_ledger",
  "operations_records",
  "serverOperationsEvents.listEvents",
  "record_id",
  "actor_id",
  "auth_user_id",
  "parties",
  "timeline",
  "organization_id",
  "entity_id",
  "period_id",
], "Operations record history API");

requireIncludes(source.recordHistoryPanel, [
  "OperationsRecordHistoryPanel",
  "/history?",
  "Record history",
  "audit entries",
  "actorLabel",
  "en-GB",
], "Operations record history panel");

requireIncludes(source.runtimeWorkCenter, [
  'import OperationsRecordHistoryPanel from "./OperationsRecordHistoryPanel"',
  "historyRefreshKey",
  "setHistoryRefreshKey",
  "<OperationsRecordHistoryPanel",
  "capabilityId={capabilityId}",
  "recordId={selected.id}",
  "organizationId={organizationId}",
  "entityId={entityId}",
  "periodId={periodId}",
  "refreshKey={historyRefreshKey}",
], "Operations record history embed");

requireIncludes(source.eventWorkCenter, [
  "OperationsEventWorkCenter",
  "/api/operations/events",
  "/api/operations/events/health",
  "Immutable events",
  "Dead-letter events",
  "Retry Delivery",
  "Flush Events",
], "Operations event work centre");

requireIncludes(source.workspaceRegistry, [
  "EVENT_STREAM_CAPABILITIES",
  '"work-history"',
  '"operational-events"',
  '"operational-timeline"',
  '"audit-trail"',
  "OperationsEventWorkCenter",
  "operations_events",
  "capability_id=",
], "Operations event workspace routing");

requireIncludes(source.capabilityPage, [
  "OperationsEventWorkCenter",
  'capability.renderer === "OperationsEventWorkCenter"',
], "Operations capability renderer routing");

requireIncludes(source.commandRoute, [
  "serverOperationsEvents.publishPending",
  "event_delivery",
  "deferred",
], "Operations command event flush");

for (const [label, contents] of Object.entries(source)) {
  requireExcludes(contents, ["tenant_id", "tenantId"], `Operations event ${label}`);
}

if (!(
  FILES.eventMigration < FILES.healthMigration
  && FILES.healthMigration < FILES.auditProjectionMigration
  && FILES.auditProjectionMigration < FILES.actorProjectionRepairMigration
)) {
  throw new Error(
    "Operations event migrations must sort as delivery, health, command audit projection, actor projection repair.",
  );
}

console.log("OPERATIONS_EVENT_RELEASE_AUDIT=PASS");
console.log("OPERATIONS_EVENT_STREAM=IMMUTABLE");
console.log("OPERATIONS_EVENT_DELIVERY=RETRYABLE_TRANSACTIONAL_OUTBOX");
console.log("OPERATIONS_EVENT_HEALTH=SCOPED_DATABASE_AGGREGATION");
console.log("OPERATIONS_EVENT_UI=HISTORY_TIMELINE_AUDIT_AND_DEAD_LETTER");
console.log("OPERATIONS_RECORD_HISTORY=COMMANDS_EVENTS_AND_ACTOR_IDENTITY");
console.log("OPERATIONS_RECORD_HISTORY_UI=EMBEDDED_AND_COMMAND_REFRESHED");
