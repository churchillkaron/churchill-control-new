import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  startSecretaryEventCoordination,
  refreshSecretaryEventCoordination,
  markSecretaryEventReady,
  completeSecretaryEventCoordination,
  readSecretaryEventCoordination,
} from "../lib/operator/secretary/SecretaryEventCoordinationRuntime.js";
import {
  startSecretaryOfficeReproduction,
  recordSecretaryOfficeReproductionProgress,
  completeSecretaryOfficeReproduction,
  readSecretaryOfficeReproduction,
} from "../lib/operator/secretary/SecretaryOfficeReproductionRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const guestTaskId = randomUUID();
const resourceTaskId = randomUUID();
const hospitalityTaskId = randomUUID();
const context = { organizationId, timezone: "Asia/Bangkok", actor: { partyId: ownerPartyId }, metadata: { partyId: ownerPartyId } };

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}
async function rejectsMessage(run, expected) {
  let caught = null;
  try { await run(); } catch (error) { caught = error; }
  assert.ok(caught, `Expected rejection ${expected}`);
  assert.equal(caught.message, expected);
}

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Final Human Role Gaps Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert({ id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" }).select("*").single());
await one(supabaseAdmin.from("secretary_settings").insert({ organization_id: organizationId, default_timezone: "Asia/Bangkok", appointment_duration_minutes: 30, business_hours: {}, booking_policy: { owner_party_id: ownerPartyId }, metadata: { owner_party_id: ownerPartyId } }).select("*").single());

const childBase = {
  organization_id: organizationId,
  entity_id: null,
  owner_party_id: ownerPartyId,
  contact_party_id: null,
  calendar_event_id: null,
  priority: "NORMAL",
  due_at: "2035-09-15T11:00:00Z",
  remind_at: null,
  completed_at: null,
  created_by_party_id: ownerPartyId,
};
await one(supabaseAdmin.from("secretary_tasks").insert([
  { ...childBase, id: guestTaskId, title: "Guest coordination child", details: "Synthetic governed child for parent coordination certification", status: "IN_PROGRESS", source: "secretary_event_guest_coordination", metadata: { event_guest_coordination_v1: { contract: "AVANTIQO_EXECUTIVE_SECRETARY_EVENT_GUEST_COORDINATION_V1", state: "OPEN", version: 3 } } },
  { ...childBase, id: resourceTaskId, title: "Resource reservation child", details: "Synthetic governed child for parent coordination certification", status: "IN_PROGRESS", source: "secretary_resource_reservation", metadata: { resource_reservation_v1: { contract: "AVANTIQO_EXECUTIVE_SECRETARY_RESOURCE_RESERVATION_V1", state: "RESERVED", version: 2 } } },
  { ...childBase, id: hospitalityTaskId, title: "Hospitality coordination child", details: "Synthetic governed child for parent coordination certification", status: "IN_PROGRESS", source: "secretary_hospitality_coordination", metadata: { hospitality_coordination_v1: { contract: "AVANTIQO_EXECUTIVE_SECRETARY_HOSPITALITY_COORDINATION_V1", state: "READY_FOR_EVENT", version: 5 } } },
]).select("*"));

const eventStarted = await startSecretaryEventCoordination({
  context,
  payload: {
    title: "Executive Reception",
    starts_at: "2035-09-15T11:00:00Z",
    ends_at: "2035-09-15T13:00:00Z",
    timezone: "Asia/Bangkok",
    location: "Executive Lounge",
    components: [
      { kind: "GUESTS", task_id: guestTaskId, required: true },
      { kind: "RESOURCE", task_id: resourceTaskId, required: true },
      { kind: "HOSPITALITY", task_id: hospitalityTaskId, required: true },
    ],
    supporting_references: [
      { kind: "DEADLINE", reference_id: "deadline-1", label: "Final guest confirmation" },
      { kind: "DOCUMENT", reference_id: "document-1", label: "Event brief" },
    ],
    evidence_id: "event-start-1",
    started_at: "2035-09-01T01:00:00Z",
  },
});
assert.equal(eventStarted.record.state, "OPEN");
assert.equal(eventStarted.record.version, 1);
assert.equal(eventStarted.record.readiness.ready, false);
assert.deepEqual(eventStarted.record.readiness.required_not_ready, [{ kind: "GUESTS", task_id: guestTaskId, child_state: "OPEN" }]);

await rejectsMessage(() => markSecretaryEventReady({ context, payload: { coordination_id: eventStarted.coordination.id, expected_version: 1, evidence_id: "event-ready-too-early", occurred_at: "2035-09-01T01:05:00Z" } }), "SECRETARY_EVENT_COORDINATION_REQUIRED_COMPONENTS_NOT_READY");

const guestTask = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", organizationId).eq("id", guestTaskId).single());
await one(supabaseAdmin.from("secretary_tasks").update({ metadata: { ...(guestTask.metadata || {}), event_guest_coordination_v1: { ...(guestTask.metadata?.event_guest_coordination_v1 || {}), state: "FINALIZED", version: 4 } } }).eq("organization_id", organizationId).eq("id", guestTaskId).select("*").single());

const refreshed = await refreshSecretaryEventCoordination({ context, payload: { coordination_id: eventStarted.coordination.id, expected_version: 1, evidence_id: "event-refresh-1", occurred_at: "2035-09-01T01:10:00Z" } });
assert.equal(refreshed.record.version, 2);
assert.equal(refreshed.record.readiness.ready, true);
await rejectsMessage(() => markSecretaryEventReady({ context, payload: { coordination_id: eventStarted.coordination.id, expected_version: 1, evidence_id: "event-ready-stale", occurred_at: "2035-09-01T01:11:00Z" } }), "SECRETARY_EVENT_COORDINATION_STALE_VERSION");

const ready = await markSecretaryEventReady({ context, payload: { coordination_id: eventStarted.coordination.id, expected_version: 2, evidence_id: "event-ready-1", occurred_at: "2035-09-01T01:12:00Z" } });
assert.equal(ready.record.state, "READY");
assert.equal(ready.record.version, 3);
assert.equal(ready.record.frozen_ready_snapshots.length, 1);
assert.equal(ready.record.frozen_ready_snapshots[0].child_workflow_mutated, false);
assert.equal(ready.record.frozen_ready_snapshots[0].readiness_inferred, false);

const eventCompletionPayload = { coordination_id: eventStarted.coordination.id, expected_version: 3, completion_summary: "Event coordination closed from explicit owner evidence.", evidence_id: "event-complete-1", occurred_at: "2035-09-15T14:00:00Z" };
const eventCompleted = await completeSecretaryEventCoordination({ context, payload: eventCompletionPayload });
assert.equal(eventCompleted.record.state, "COMPLETED");
assert.equal(eventCompleted.record.version, 4);
const eventReplay = await completeSecretaryEventCoordination({ context, payload: eventCompletionPayload });
assert.equal(eventReplay.replay_safe, true);
const eventRead = await readSecretaryEventCoordination({ context, payload: { coordination_id: eventStarted.coordination.id } });
assert.equal(eventRead.record.state, "COMPLETED");

const printStarted = await startSecretaryOfficeReproduction({
  context,
  payload: {
    operation: "PRINT",
    title: "Executive reception pack",
    source_reference: "document:reception-pack-v1",
    copies: 12,
    duplex: true,
    color_mode: "COLOR",
    page_size: "A4",
    device_reference: "front-office-printer",
    handling_instructions: "Keep pages in order and hand to executive assistant.",
    evidence_id: "print-start-1",
    started_at: "2035-09-01T02:00:00Z",
  },
});
assert.equal(printStarted.record.state, "OPEN");
assert.equal(printStarted.record.version, 1);
assert.equal(printStarted.record.specs.copies, 12);
assert.equal(printStarted.physical_operation_performed_by_secretary, false);

const printProgress = await recordSecretaryOfficeReproductionProgress({ context, payload: { request_id: printStarted.request.id, expected_version: 1, stage: "HANDED_OFF", note: "Front-office staff acknowledged the print request.", evidence_id: "print-progress-1", occurred_at: "2035-09-01T02:05:00Z" } });
assert.equal(printProgress.record.version, 2);
assert.equal(printProgress.record.progress.at(-1).completion_inferred, false);
await rejectsMessage(() => recordSecretaryOfficeReproductionProgress({ context, payload: { request_id: printStarted.request.id, expected_version: 1, stage: "IN_PROCESS", note: "Stale write must fail.", evidence_id: "print-progress-stale", occurred_at: "2035-09-01T02:06:00Z" } }), "SECRETARY_OFFICE_REPRODUCTION_STALE_VERSION");
await rejectsMessage(() => completeSecretaryOfficeReproduction({ context, payload: { request_id: printStarted.request.id, expected_version: 2, output_reference: "", completion_summary: "Should not complete without output evidence.", evidence_id: "print-complete-missing-output", occurred_at: "2035-09-01T02:10:00Z" } }), "SECRETARY_OFFICE_REPRODUCTION_OUTPUT_REFERENCE_REQUIRED");

const printCompletionPayload = { request_id: printStarted.request.id, expected_version: 2, output_reference: "physical-handoff:front-office:2035-09-01T02:12:00Z", completion_summary: "Front-office staff confirmed the 12-copy output was ready for handoff.", evidence_id: "print-complete-1", occurred_at: "2035-09-01T02:12:00Z" };
const printCompleted = await completeSecretaryOfficeReproduction({ context, payload: printCompletionPayload });
assert.equal(printCompleted.record.state, "COMPLETED");
assert.equal(printCompleted.record.version, 3);
assert.equal(printCompleted.physical_operation_performed_by_secretary, false);
assert.equal(printCompleted.print_completion_inferred, false);
const printReplay = await completeSecretaryOfficeReproduction({ context, payload: printCompletionPayload });
assert.equal(printReplay.replay_safe, true);
const printRead = await readSecretaryOfficeReproduction({ context, payload: { request_id: printStarted.request.id } });
assert.equal(printRead.record.state, "COMPLETED");

for (const result of [eventStarted, refreshed, ready, eventCompleted, eventReplay, eventRead]) {
  assert.equal(result.child_workflow_mutated, false);
  assert.equal(result.child_completion_inferred, false);
  assert.equal(result.attendance_inferred, false);
  assert.equal(result.physical_access_granted_by_secretary, false);
  assert.equal(result.resource_reserved_by_parent, false);
  assert.equal(result.catering_ordered, false);
  assert.equal(result.purchase_performed, false);
  assert.equal(result.payment_authority_created, false);
  assert.equal(result.signing_authority_created, false);
  assert.equal(result.provider_calls_performed, false);
  assert.equal(result.external_authority_used, false);
}
for (const result of [printStarted, printProgress, printCompleted, printReplay, printRead]) {
  assert.equal(result.physical_operation_performed_by_secretary, false);
  assert.equal(result.document_content_modified_by_runtime, false);
  assert.equal(result.external_sharing_performed, false);
  assert.equal(result.device_permission_mutated, false);
  assert.equal(result.device_credential_stored, false);
  assert.equal(result.purchase_performed, false);
  assert.equal(result.payment_authority_created, false);
  assert.equal(result.provider_calls_performed, false);
  assert.equal(result.external_authority_used, false);
}

console.log("SECRETARY_FINAL_HUMAN_ROLE_GAPS_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_EVENT_REQUIRED_CHILD_BLOCKS_READY=true");
console.log("SECRETARY_EVENT_CHILD_REFRESH_READ_ONLY=true");
console.log("SECRETARY_EVENT_STALE_VERSION_FENCED=true");
console.log("SECRETARY_EVENT_READY_SNAPSHOT_FROZEN=true");
console.log("SECRETARY_EVENT_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_PRINT_SCAN_REAL_RECORD_LIFECYCLE=true");
console.log("SECRETARY_PRINT_SCAN_STALE_VERSION_FENCED=true");
console.log("SECRETARY_PRINT_SCAN_COMPLETION_REQUIRES_OUTPUT_EVIDENCE=true");
console.log("SECRETARY_PRINT_SCAN_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_PHYSICAL_DEVICE_AUTHORITY_CREATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");