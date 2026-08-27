import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_NOTES_DICTATION_V1";
const SOURCE = "secretary_executive_notes_dictation";
const REGISTER_KEY = "executive_notes_dictation_v1";
const KINDS = new Set(["DICTATION", "EXECUTIVE_NOTE", "MEMO", "LETTER_DRAFT", "BRIEFING_NOTE", "OTHER"]);
const MUTABLE_STATES = new Set(["DRAFT", "FINAL"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function exactText(value, field, limit = 60000) {
  if (typeof value !== "string") throw new Error(`SECRETARY_NOTES_${field.toUpperCase()}_MUST_BE_STRING`);
  if (!value.trim()) throw new Error(`SECRETARY_NOTES_${field.toUpperCase()}_REQUIRED`);
  if (value.length > limit) throw new Error(`SECRETARY_NOTES_${field.toUpperCase()}_TOO_LARGE`);
  return value;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function organizationId(context = {}) {
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

function actorPartyId(context = {}) {
  const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return id;
}

function iso(value, field) {
  const raw = text(value, 180);
  if (!raw) throw new Error(`SECRETARY_NOTES_${field.toUpperCase()}_REQUIRED`);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_NOTES_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const raw = chars.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safetyFlags() {
  return {
    exact_text_preserved: true,
    content_modified_by_secretary: false,
    transcription_performed: false,
    audio_processed: false,
    speaker_identity_inferred: false,
    meaning_inferred: false,
    instruction_inferred: false,
    directive_created: false,
    decision_created: false,
    commitment_created: false,
    task_execution_created: false,
    correspondence_sent: false,
    document_published: false,
    signature_applied: false,
    payment_authority_created: false,
    signing_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    provider_calls_performed: false,
    external_authority_used: false,
  };
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

function normalizeKind(value) {
  const kind = text(value || "EXECUTIVE_NOTE", 80).toUpperCase();
  if (!KINDS.has(kind)) throw new Error("SECRETARY_NOTES_KIND_INVALID");
  return kind;
}

async function ensureParty({ organization, partyId, field }) {
  const id = text(partyId, 120);
  if (!id) return null;
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id,display_name,email,phone,party_type,status")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!party) throw new Error(`SECRETARY_NOTES_${field.toUpperCase()}_PARTY_NOT_FOUND`);
  return party;
}

async function routingFor({ context, instruction, at }) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const owner = text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actor;
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId: owner,
    scope: "DOCUMENT_COORDINATION",
    instruction,
    at,
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_NOTES_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_NOTES_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

function registerFromTask(task) {
  const register = object(object(task?.metadata)[REGISTER_KEY]);
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_NOTES_RECORD_INVALID");
  return {
    ...register,
    history: list(register.history),
    content_versions: list(register.content_versions),
  };
}

async function readTask({ organization, noteId }) {
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", noteId)
      .maybeSingle(),
  );
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_NOTES_NOT_FOUND");
  return task;
}

function eventEntry({ event, evidenceId, at, actor, version, details = {} }) {
  return {
    event,
    evidence_id: evidenceId,
    occurred_at: at,
    recorded_by_party_id: actor,
    version,
    ...object(details),
    ...safetyFlags(),
  };
}

function contentVersion({ version, content, evidenceId, at, mode }) {
  return {
    version,
    exact_content: content,
    content_sha256: sha256(content),
    evidence_id: evidenceId,
    captured_at: at,
    mode,
    exact_text_preserved: true,
    content_modified_by_secretary: false,
  };
}

async function mutateNote({ context, payload, instruction, allowedStates, eventName, producer }) {
  const noteId = text(payload.note_id || payload.noteId, 120);
  if (!noteId) throw new Error("SECRETARY_NOTES_NOTE_ID_REQUIRED");
  const at = iso(payload.occurred_at || payload.occurredAt || payload.appended_at || payload.appendedAt || payload.revised_at || payload.revisedAt || payload.finalized_at || payload.finalizedAt || payload.cancelled_at || payload.cancelledAt, "occurred_at");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_NOTES_EVIDENCE_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_NOTES_EXPECTED_VERSION_REQUIRED");
  const auth = await routingFor({ context, instruction, at });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask({ organization: auth.organization, noteId });
    const register = registerFromTask(task);
    const replay = register.history.find((entry) => entry.evidence_id === evidenceId);
    if (replay) {
      if (replay.event === eventName) {
        return { status: "completed", contract: CONTRACT, note: task, record: register, replay_safe: true, ...safetyFlags() };
      }
      throw new Error("SECRETARY_NOTES_EVIDENCE_REUSE_CONFLICT");
    }
    if (Number(register.version) !== expectedVersion) throw new Error("SECRETARY_NOTES_STALE_VERSION");
    if (!allowedStates.has(register.state)) throw new Error(`SECRETARY_NOTES_STATE_INVALID:${register.state}`);

    const nextVersion = Number(register.version) + 1;
    const produced = await producer({ task, register, auth, at, evidenceId, nextVersion });
    const next = {
      ...register,
      ...object(produced.patch),
      version: nextVersion,
      contract: CONTRACT,
      history: [...register.history, produced.historyEntry].slice(-500),
      content_versions: list(produced.contentVersions || register.content_versions).slice(-50),
      ...safetyFlags(),
    };
    const cancelled = next.state === "CANCELLED";
    const finalized = next.state === "FINAL";
    const result = await supabaseAdmin.from("secretary_tasks")
      .update({
        status: cancelled ? "CANCELLED" : "DONE",
        completed_at: cancelled || finalized ? at : null,
        metadata: {
          ...object(task.metadata),
          [REGISTER_KEY]: next,
          secretary_notes_dictation_contract: CONTRACT,
          secretary_notes_dictation_state: next.state,
          ledger_task_is_execution_work: false,
          ...secretaryAdministrativeCoverageMetadata(auth.routing),
          ...safetyFlags(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", auth.organization)
      .eq("id", task.id)
      .eq("updated_at", task.updated_at)
      .select("*")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) continue;
    return { status: "completed", contract: CONTRACT, note: result.data, record: next, replay_safe: false, ...safetyFlags() };
  }

  throw new Error("SECRETARY_NOTES_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function captureSecretaryExecutiveNote({ context, payload = {} } = {}) {
  const kind = normalizeKind(payload.kind);
  const title = text(payload.title, 600);
  if (!title) throw new Error("SECRETARY_NOTES_TITLE_REQUIRED");
  const content = exactText(payload.content, "content");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_NOTES_EVIDENCE_REQUIRED");
  const capturedAt = iso(payload.captured_at || payload.capturedAt, "captured_at");
  const auth = await routingFor({ context, instruction: `Capture exact executive ${kind.toLowerCase()} text without interpretation or external action.`, at: capturedAt });
  const speaker = await ensureParty({ organization: auth.organization, partyId: payload.speaker_party_id || payload.speakerPartyId, field: "speaker" });
  const contentHash = sha256(content);
  const noteId = deterministicUuid(`avantiqo-secretary-notes-v1:${auth.organization}:${kind}:${evidenceId}:${capturedAt}:${contentHash}`);
  const existing = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", auth.organization)
      .eq("id", noteId)
      .maybeSingle(),
  );
  if (existing) {
    return { status: "captured", contract: CONTRACT, note: existing, record: registerFromTask(existing), replay_safe: true, ...safetyFlags() };
  }

  const register = {
    contract: CONTRACT,
    note_id: noteId,
    kind,
    title,
    state: "DRAFT",
    version: 1,
    exact_content: content,
    content_sha256: contentHash,
    speaker_party_id: speaker?.id || null,
    source_reference: text(payload.source_reference || payload.sourceReference, 1000) || null,
    canonical_owner_party_id: auth.owner,
    operational_assignee_party_id: auth.operational,
    captured_at: capturedAt,
    finalized_at: null,
    content_versions: [contentVersion({ version: 1, content, evidenceId, at: capturedAt, mode: "CAPTURE" })],
    history: [eventEntry({ event: "NOTE_CAPTURED", evidenceId, at: capturedAt, actor: auth.actor, version: 1, details: { kind, content_sha256: contentHash } })],
    ...safetyFlags(),
  };

  const task = await one(
    supabaseAdmin.from("secretary_tasks").insert({
      id: noteId,
      organization_id: auth.organization,
      entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
      owner_party_id: auth.operational,
      contact_party_id: speaker?.id || null,
      title: `Executive note: ${title}`,
      details: `${kind} exact-text ledger`,
      status: "DONE",
      priority: "NORMAL",
      due_at: null,
      remind_at: null,
      completed_at: null,
      source: SOURCE,
      created_by_party_id: auth.actor,
      metadata: {
        [REGISTER_KEY]: register,
        secretary_notes_dictation_contract: CONTRACT,
        secretary_notes_dictation_state: "DRAFT",
        ledger_task_is_execution_work: false,
        ...secretaryAdministrativeCoverageMetadata(auth.routing),
        ...safetyFlags(),
      },
    }).select("*").single(),
  );

  return { status: "captured", contract: CONTRACT, note: task, record: register, replay_safe: false, ...safetyFlags() };
}

export async function appendSecretaryExecutiveNote({ context, payload = {} } = {}) {
  const segment = exactText(payload.segment, "segment");
  return mutateNote({
    context,
    payload: { ...payload, occurred_at: payload.appended_at || payload.appendedAt },
    instruction: "Append exact dictated/note text exactly as supplied. Do not rewrite, summarize, interpret, or create downstream authority.",
    allowedStates: new Set(["DRAFT"]),
    eventName: "SEGMENT_APPENDED",
    producer: async ({ register, auth, at, evidenceId, nextVersion }) => {
      const content = `${register.exact_content}${segment}`;
      const hash = sha256(content);
      return {
        patch: { exact_content: content, content_sha256: hash, finalized_at: null },
        contentVersions: [...register.content_versions, contentVersion({ version: nextVersion, content, evidenceId, at, mode: "APPEND" })],
        historyEntry: eventEntry({ event: "SEGMENT_APPENDED", evidenceId, at, actor: auth.actor, version: nextVersion, details: { segment_sha256: sha256(segment), content_sha256: hash } }),
      };
    },
  });
}

export async function reviseSecretaryExecutiveNote({ context, payload = {} } = {}) {
  const replacement = exactText(payload.replacement_content || payload.replacementContent, "replacement_content");
  return mutateNote({
    context,
    payload: { ...payload, occurred_at: payload.revised_at || payload.revisedAt },
    instruction: "Replace the current note with explicitly supplied corrected text while preserving prior versions. Do not infer corrections or editorial intent.",
    allowedStates: MUTABLE_STATES,
    eventName: "REVISION_RECORDED",
    producer: async ({ register, auth, at, evidenceId, nextVersion }) => {
      const hash = sha256(replacement);
      return {
        patch: { state: "DRAFT", exact_content: replacement, content_sha256: hash, finalized_at: null },
        contentVersions: [...register.content_versions, contentVersion({ version: nextVersion, content: replacement, evidenceId, at, mode: "REVISION" })],
        historyEntry: eventEntry({ event: "REVISION_RECORDED", evidenceId, at, actor: auth.actor, version: nextVersion, details: { prior_content_sha256: register.content_sha256, content_sha256: hash } }),
      };
    },
  });
}

export async function finalizeSecretaryExecutiveNote({ context, payload = {} } = {}) {
  return mutateNote({
    context,
    payload: { ...payload, occurred_at: payload.finalized_at || payload.finalizedAt },
    instruction: "Mark the captured executive note as final evidence only. Do not send, publish, sign, execute, or convert it into a directive or decision.",
    allowedStates: new Set(["DRAFT"]),
    eventName: "NOTE_FINALIZED",
    producer: async ({ register, auth, at, evidenceId, nextVersion }) => ({
      patch: { state: "FINAL", finalized_at: at },
      historyEntry: eventEntry({ event: "NOTE_FINALIZED", evidenceId, at, actor: auth.actor, version: nextVersion, details: { content_sha256: register.content_sha256 } }),
    }),
  });
}

export async function cancelSecretaryExecutiveNote({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 2000) || null;
  return mutateNote({
    context,
    payload: { ...payload, occurred_at: payload.cancelled_at || payload.cancelledAt },
    instruction: "Cancel only the Secretary note record. Do not cancel or reverse any external action because this note creates none.",
    allowedStates: new Set(["DRAFT", "FINAL", "CANCELLED"]),
    eventName: "NOTE_CANCELLED",
    producer: async ({ auth, at, evidenceId, nextVersion }) => ({
      patch: { state: "CANCELLED", cancelled_at: at, cancellation_reason: reason },
      historyEntry: eventEntry({ event: "NOTE_CANCELLED", evidenceId, at, actor: auth.actor, version: nextVersion, details: { reason } }),
    }),
  });
}

export async function readSecretaryExecutiveNote({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const noteId = text(payload.note_id || payload.noteId, 120);
  if (!noteId) throw new Error("SECRETARY_NOTES_NOTE_ID_REQUIRED");
  const task = await readTask({ organization, noteId });
  return { status: "completed", contract: CONTRACT, note: task, record: registerFromTask(task), ...safetyFlags() };
}

export async function listSecretaryExecutiveNotes({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const owner = text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actor;
  const rows = await many(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("source", SOURCE)
      .order("created_at", { ascending: false })
      .limit(Math.min(300, Math.max(1, Number(payload.limit || 100)))),
  );
  const kind = text(payload.kind, 80).toUpperCase();
  const includeCancelled = payload.include_cancelled === true || payload.includeCancelled === true;
  const notes = rows
    .map((task) => ({ task, record: registerFromTask(task) }))
    .filter((entry) => entry.record.canonical_owner_party_id === owner)
    .filter((entry) => !kind || entry.record.kind === kind)
    .filter((entry) => includeCancelled || entry.record.state !== "CANCELLED");
  return { status: "completed", contract: CONTRACT, owner_party_id: owner, count: notes.length, notes, ...safetyFlags() };
}

export default {
  captureSecretaryExecutiveNote,
  appendSecretaryExecutiveNote,
  reviseSecretaryExecutiveNote,
  finalizeSecretaryExecutiveNote,
  cancelSecretaryExecutiveNote,
  readSecretaryExecutiveNote,
  listSecretaryExecutiveNotes,
};
