import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_OFFICE_REPRODUCTION_V1";
const SOURCE = "secretary_office_reproduction";
const REGISTER_KEY = "office_reproduction_v1";
const OPERATIONS = new Set(["PRINT", "SCAN"]);
const PROGRESS_STAGES = new Set(["QUEUED", "HANDED_OFF", "IN_PROCESS", "OUTPUT_READY", "EXCEPTION"]);
const COLOR_MODES = new Set(["AUTO", "COLOR", "GRAYSCALE", "BLACK_WHITE"]);

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function organizationId(context = {}) { const id = text(context.organizationId, 120); if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED"); return id; }
function actorPartyId(context = {}) { const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120); if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED"); return id; }
function iso(value, field, required = true) {
  const raw = text(value, 180);
  if (!raw) { if (required) throw new Error(`SECRETARY_OFFICE_REPRODUCTION_${field.toUpperCase()}_REQUIRED`); return null; }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_OFFICE_REPRODUCTION_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}
function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const raw = chars.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}
function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}
function payloadHash(value) { return createHash("sha256").update(stableJson(value)).digest("hex"); }
function safetyFlags() {
  return {
    physical_operation_performed_by_secretary: false,
    print_completion_inferred: false,
    scan_completion_inferred: false,
    document_content_read_by_runtime: false,
    document_content_modified_by_runtime: false,
    external_sharing_performed: false,
    device_permission_mutated: false,
    device_configuration_mutated: false,
    device_credential_stored: false,
    device_secret_stored: false,
    purchase_performed: false,
    order_placed: false,
    payment_authority_created: false,
    signing_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    provider_calls_performed: false,
    external_authority_used: false,
  };
}
async function one(result) { const resolved = await result; if (resolved.error) throw resolved.error; return resolved.data || null; }
async function many(result) { const resolved = await result; if (resolved.error) throw resolved.error; return Array.isArray(resolved.data) ? resolved.data : []; }

async function routingFor({ context, instruction, at }) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const owner = text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actor;
  const routing = await resolveSecretaryAdministrativeCoverage({ organizationId: organization, ownerPartyId: owner, scope: "DOCUMENT_COORDINATION", instruction, at, requiresOwnerAuthority: false });
  if (routing.coverage_routing_review_required === true) throw new Error(`SECRETARY_OFFICE_REPRODUCTION_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_OFFICE_REPRODUCTION_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}
function normalizeOperation(value) { const operation = text(value, 40).toUpperCase(); if (!OPERATIONS.has(operation)) throw new Error("SECRETARY_OFFICE_REPRODUCTION_OPERATION_INVALID"); return operation; }
function normalizeCopies(value, operation) { if (operation !== "PRINT") return null; const copies = value === undefined || value === null || value === "" ? 1 : Number(value); if (!Number.isInteger(copies) || copies < 1 || copies > 1000) throw new Error("SECRETARY_OFFICE_REPRODUCTION_COPIES_INVALID"); return copies; }
function normalizeColorMode(value) { const mode = text(value || "AUTO", 40).toUpperCase(); if (!COLOR_MODES.has(mode)) throw new Error("SECRETARY_OFFICE_REPRODUCTION_COLOR_MODE_INVALID"); return mode; }
function normalizeSpecs(payload, operation) {
  return { copies: normalizeCopies(payload.copies, operation), duplex: operation === "PRINT" ? payload.duplex === true : null, color_mode: normalizeColorMode(payload.color_mode || payload.colorMode), page_size: text(payload.page_size || payload.pageSize, 80) || null, orientation: text(payload.orientation, 40).toUpperCase() || null, device_reference: text(payload.device_reference || payload.deviceReference, 500) || null, output_destination: text(payload.output_destination || payload.outputDestination, 1000) || null, handling_instructions: text(payload.handling_instructions || payload.handlingInstructions, 2000) || null };
}
function registerFromTask(task) { const register = object(object(task?.metadata)[REGISTER_KEY]); if (register.contract !== CONTRACT) throw new Error("SECRETARY_OFFICE_REPRODUCTION_RECORD_INVALID"); return { ...register, history: list(register.history), progress: list(register.progress) }; }
async function readTask(organization, requestId) { const task = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", organization).eq("id", requestId).maybeSingle()); if (!task || task.source !== SOURCE) throw new Error("SECRETARY_OFFICE_REPRODUCTION_NOT_FOUND"); return task; }
function historyEntry({ event, evidenceId, at, actor, version, hash, details = {} }) { return { event, evidence_id: evidenceId, occurred_at: at, recorded_by_party_id: actor, version, payload_sha256: hash, ...object(details), ...safetyFlags() }; }

async function mutateRequest({ context, payload = {}, instruction, eventName, allowedStates, producer }) {
  const requestId = text(payload.request_id || payload.requestId, 120);
  if (!requestId) throw new Error("SECRETARY_OFFICE_REPRODUCTION_REQUEST_ID_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_OFFICE_REPRODUCTION_EXPECTED_VERSION_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_OFFICE_REPRODUCTION_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at");
  const hash = payloadHash(payload);
  const auth = await routingFor({ context, instruction, at: occurredAt });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask(auth.organization, requestId);
    const register = registerFromTask(task);
    const replay = register.history.find((entry) => entry.evidence_id === evidenceId);
    if (replay) { if (replay.event === eventName && replay.payload_sha256 === hash) return { status: "completed", contract: CONTRACT, request: task, record: register, replay_safe: true, ...safetyFlags() }; throw new Error("SECRETARY_OFFICE_REPRODUCTION_EVIDENCE_REUSE_CONFLICT"); }
    if (!allowedStates.has(register.state)) throw new Error(`SECRETARY_OFFICE_REPRODUCTION_STATE_INVALID:${register.state}`);
    if (Number(register.version) !== expectedVersion) throw new Error("SECRETARY_OFFICE_REPRODUCTION_STALE_VERSION");
    const produced = await producer({ task, register, auth, occurredAt, evidenceId });
    const nextVersion = expectedVersion + 1;
    const next = { ...register, ...object(produced.patch), contract: CONTRACT, version: nextVersion, history: [...register.history, historyEntry({ event: eventName, evidenceId, at: occurredAt, actor: auth.actor, version: nextVersion, hash, details: produced.historyDetails })].slice(-500), ...safetyFlags() };
    const terminal = ["COMPLETED", "CANCELLED"].includes(next.state);
    const update = await supabaseAdmin.from("secretary_tasks").update({ status: next.state === "CANCELLED" ? "CANCELLED" : terminal ? "DONE" : "IN_PROGRESS", completed_at: terminal ? occurredAt : null, metadata: { ...object(task.metadata), [REGISTER_KEY]: next, secretary_office_reproduction_contract: CONTRACT, secretary_office_reproduction_state: next.state, ...secretaryAdministrativeCoverageMetadata(auth.routing), ...safetyFlags() }, updated_at: new Date().toISOString() }).eq("organization_id", auth.organization).eq("id", task.id).eq("updated_at", task.updated_at).select("*").maybeSingle();
    if (update.error) throw update.error;
    if (!update.data) continue;
    return { status: "completed", contract: CONTRACT, request: update.data, record: next, replay_safe: false, ...safetyFlags() };
  }
  throw new Error("SECRETARY_OFFICE_REPRODUCTION_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function startSecretaryOfficeReproduction({ context, payload = {} } = {}) {
  const operation = normalizeOperation(payload.operation);
  const title = text(payload.title, 600); if (!title) throw new Error("SECRETARY_OFFICE_REPRODUCTION_TITLE_REQUIRED");
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1000); if (!sourceReference) throw new Error("SECRETARY_OFFICE_REPRODUCTION_SOURCE_REFERENCE_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500); if (!evidenceId) throw new Error("SECRETARY_OFFICE_REPRODUCTION_EVIDENCE_REQUIRED");
  const startedAt = iso(payload.started_at || payload.startedAt, "started_at");
  const dueAt = iso(payload.due_at || payload.dueAt, "due_at", false);
  const specs = normalizeSpecs(payload, operation);
  const auth = await routingFor({ context, instruction: `Coordinate a ${operation.toLowerCase()} office reproduction request without claiming physical device execution.`, at: startedAt });
  const requestId = deterministicUuid(`avantiqo-secretary-office-reproduction-v1:${auth.organization}:${operation}:${evidenceId}`);
  const startBody = { requestId, operation, title, sourceReference, dueAt, specs, evidenceId, startedAt };
  const hash = payloadHash(startBody);
  const existing = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", auth.organization).eq("id", requestId).maybeSingle());
  if (existing) { const register = registerFromTask(existing); const first = register.history[0]; if (first?.event === "OFFICE_REPRODUCTION_STARTED" && first?.evidence_id === evidenceId && first?.payload_sha256 === hash) return { status: "open", contract: CONTRACT, request: existing, record: register, replay_safe: true, ...safetyFlags() }; throw new Error("SECRETARY_OFFICE_REPRODUCTION_EVIDENCE_REUSE_CONFLICT"); }
  const register = { contract: CONTRACT, request_id: requestId, state: "OPEN", version: 1, operation, title, source_reference: sourceReference, due_at: dueAt, specs, progress: [], output_reference: null, completion_summary: null, started_at: startedAt, completed_at: null, cancelled_at: null, cancellation_reason: null, canonical_owner_party_id: auth.owner, operational_assignee_party_id: auth.operational, history: [historyEntry({ event: "OFFICE_REPRODUCTION_STARTED", evidenceId, at: startedAt, actor: auth.actor, version: 1, hash, details: { operation } })], ...safetyFlags() };
  const task = await one(supabaseAdmin.from("secretary_tasks").insert({ id: requestId, organization_id: auth.organization, entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null, owner_party_id: auth.operational, contact_party_id: null, calendar_event_id: null, title: `${operation === "PRINT" ? "Print" : "Scan"} coordination: ${title}`, details: "Coordinate a physical office reproduction handoff and record explicit progress/completion evidence. The digital Secretary does not claim to operate a printer/scanner or mutate device permissions.", status: "IN_PROGRESS", priority: text(payload.priority || "NORMAL", 40).toUpperCase(), due_at: dueAt, remind_at: null, completed_at: null, source: SOURCE, created_by_party_id: auth.actor, metadata: { [REGISTER_KEY]: register, secretary_office_reproduction_contract: CONTRACT, secretary_office_reproduction_state: "OPEN", ...secretaryAdministrativeCoverageMetadata(auth.routing), ...safetyFlags() } }).select("*").single());
  return { status: "open", contract: CONTRACT, request: task, record: register, replay_safe: false, ...safetyFlags() };
}

export async function recordSecretaryOfficeReproductionProgress({ context, payload = {} } = {}) {
  const stage = text(payload.stage, 80).toUpperCase(); if (!PROGRESS_STAGES.has(stage)) throw new Error("SECRETARY_OFFICE_REPRODUCTION_PROGRESS_STAGE_INVALID");
  const note = text(payload.note, 2000); if (!note) throw new Error("SECRETARY_OFFICE_REPRODUCTION_PROGRESS_NOTE_REQUIRED");
  return mutateRequest({ context, payload, instruction: "Record explicit print/scan coordination progress without inferring physical completion.", eventName: "OFFICE_REPRODUCTION_PROGRESS_RECORDED", allowedStates: new Set(["OPEN"]), producer: async ({ register, occurredAt, evidenceId }) => ({ patch: { specs: { ...object(register.specs), device_reference: text(payload.device_reference || payload.deviceReference, 500) || object(register.specs).device_reference || null }, progress: [...register.progress, { stage, note, evidence_id: evidenceId, occurred_at: occurredAt, output_reference: text(payload.output_reference || payload.outputReference, 1000) || null, physical_operation_performed_by_secretary: false, completion_inferred: false }].slice(-100) }, historyDetails: { stage } }) });
}
export async function completeSecretaryOfficeReproduction({ context, payload = {} } = {}) {
  const outputReference = text(payload.output_reference || payload.outputReference, 1000); if (!outputReference) throw new Error("SECRETARY_OFFICE_REPRODUCTION_OUTPUT_REFERENCE_REQUIRED");
  const summary = text(payload.completion_summary || payload.completionSummary, 3000); if (!summary) throw new Error("SECRETARY_OFFICE_REPRODUCTION_COMPLETION_SUMMARY_REQUIRED");
  return mutateRequest({ context, payload, instruction: "Record explicit third-party/device evidence that a print or scan request completed; do not infer physical execution.", eventName: "OFFICE_REPRODUCTION_COMPLETED", allowedStates: new Set(["OPEN"]), producer: async ({ register, occurredAt, evidenceId }) => ({ patch: { state: "COMPLETED", completed_at: occurredAt, output_reference: outputReference, completion_summary: summary, progress: [...register.progress, { stage: "OUTPUT_READY", note: summary, evidence_id: evidenceId, occurred_at: occurredAt, output_reference: outputReference, physical_operation_performed_by_secretary: false, completion_inferred: false }].slice(-100) }, historyDetails: { output_reference: outputReference } }) });
}
export async function cancelSecretaryOfficeReproduction({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 2000); if (!reason) throw new Error("SECRETARY_OFFICE_REPRODUCTION_CANCEL_REASON_REQUIRED");
  return mutateRequest({ context, payload, instruction: "Cancel only the Secretary print/scan coordination record without mutating any device queue or external service.", eventName: "OFFICE_REPRODUCTION_CANCELLED", allowedStates: new Set(["OPEN"]), producer: async ({ occurredAt }) => ({ patch: { state: "CANCELLED", cancelled_at: occurredAt, cancellation_reason: reason }, historyDetails: { reason } }) });
}
export async function readSecretaryOfficeReproduction({ context, payload = {} } = {}) { const organization = organizationId(context); actorPartyId(context); const requestId = text(payload.request_id || payload.requestId, 120); if (!requestId) throw new Error("SECRETARY_OFFICE_REPRODUCTION_REQUEST_ID_REQUIRED"); const task = await readTask(organization, requestId); return { status: "completed", contract: CONTRACT, request: task, record: registerFromTask(task), ...safetyFlags() }; }
export async function listSecretaryOfficeReproduction({ context, payload = {} } = {}) {
  const organization = organizationId(context); actorPartyId(context); const includeTerminal = payload.include_terminal === true || payload.includeTerminal === true; const operation = text(payload.operation, 40).toUpperCase(); if (operation && !OPERATIONS.has(operation)) throw new Error("SECRETARY_OFFICE_REPRODUCTION_OPERATION_INVALID"); const limit = Math.max(1, Math.min(Number(payload.limit) || 50, 200));
  let query = supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", organization).eq("source", SOURCE).order("created_at", { ascending: false }).limit(limit); if (!includeTerminal) query = query.eq("status", "IN_PROGRESS");
  const tasks = await many(query); const requests = tasks.map((task) => ({ request: task, record: registerFromTask(task) })).filter(({ record }) => !operation || record.operation === operation); return { status: "completed", contract: CONTRACT, count: requests.length, requests, ...safetyFlags() };
}

export default Object.freeze({ start: startSecretaryOfficeReproduction, recordProgress: recordSecretaryOfficeReproductionProgress, complete: completeSecretaryOfficeReproduction, cancel: cancelSecretaryOfficeReproduction, read: readSecretaryOfficeReproduction, list: listSecretaryOfficeReproduction });