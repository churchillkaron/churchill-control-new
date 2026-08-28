import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_TRAVEL_DOCUMENT_READINESS_V1";
const LEDGER_KEY = "travel_document_readiness_v1";
const ITEM_KINDS = new Set([
  "PASSPORT_VALIDITY",
  "VISA",
  "ETA",
  "ENTRY_FORM",
  "RETURN_ONWARD_PROOF",
  "ACCOMMODATION_REFERENCE",
  "TRAVEL_INSURANCE",
  "OTHER",
]);
const ITEM_STATES = new Set(["PENDING", "AVAILABLE", "MISSING", "NOT_REQUIRED"]);
const SENSITIVE_KEY_PATTERN = /^(passport_number|passport_no|visa_number|visa_no|document_number|national_id|national_id_number|identity_number|mrz|date_of_birth|birth_date|dob|credential|password|secret|api_key|token)$/i;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
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

function iso(value, field, { required = false } = {}) {
  const raw = text(value, 180);
  if (!raw) {
    if (required) throw new Error(`SECRETARY_TRAVEL_DOCUMENT_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_TRAVEL_DOCUMENT_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function dateOnly(value, field) {
  const raw = text(value, 40);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`SECRETARY_TRAVEL_DOCUMENT_${field.toUpperCase()}_INVALID`);
  const parsed = Date.parse(`${raw}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== raw) {
    throw new Error(`SECRETARY_TRAVEL_DOCUMENT_${field.toUpperCase()}_INVALID`);
  }
  return raw;
}

function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function rejectSensitivePayload(value, path = "payload") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitivePayload(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      throw new Error(`SECRETARY_TRAVEL_DOCUMENT_SENSITIVE_FIELD_FORBIDDEN:${key}`);
    }
    rejectSensitivePayload(child, `${path}.${key}`);
  }
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

function safetyFlags() {
  return {
    passport_number_stored: false,
    visa_number_stored: false,
    identity_document_content_read: false,
    eligibility_inferred: false,
    entry_permission_inferred: false,
    visa_requirement_inferred: false,
    legal_advice_provided: false,
    application_submitted: false,
    government_form_submitted: false,
    fee_paid: false,
    booking_authority_created: false,
    payment_authority_created: false,
    signing_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    provider_calls_performed: false,
    external_authority_used: false,
  };
}

function emptyLedger() {
  return {
    contract: CONTRACT,
    state: "NOT_STARTED",
    version: 0,
    departure_at: null,
    jurisdictions: [],
    items: [],
    frozen_versions: [],
    history: [],
    ...safetyFlags(),
  };
}

function readLedger(job) {
  const raw = object(object(job.metadata)[LEDGER_KEY]);
  if (raw.contract !== CONTRACT) return emptyLedger();
  return {
    ...emptyLedger(),
    ...raw,
    jurisdictions: list(raw.jurisdictions),
    items: list(raw.items).map((item) => ({ ...object(item), history: list(object(item).history) })),
    frozen_versions: list(raw.frozen_versions),
    history: list(raw.history),
  };
}

async function loadTravelJob(organization, jobId) {
  const id = text(jobId, 120);
  if (!id) throw new Error("SECRETARY_TRAVEL_DOCUMENT_JOB_REQUIRED");
  const job = await one(
    supabaseAdmin.from("secretary_jobs")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!job) throw new Error("SECRETARY_TRAVEL_DOCUMENT_JOB_NOT_FOUND");
  if (text(object(job.metadata).job_kind, 80).toUpperCase() !== "TRAVEL_COORDINATION") {
    throw new Error("SECRETARY_TRAVEL_DOCUMENT_JOB_KIND_INVALID");
  }
  return job;
}

async function authorizeActor({ organization, job, actor, instruction, at }) {
  const ownerPartyId = text(object(job.metadata).canonical_owner_party_id, 120) || text(job.requested_by_party_id, 120);
  if (!ownerPartyId) throw new Error("SECRETARY_TRAVEL_DOCUMENT_CANONICAL_OWNER_REQUIRED");
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId,
    scope: "TRAVEL_COORDINATION",
    instruction,
    requiresOwnerAuthority: false,
    at,
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_TRAVEL_DOCUMENT_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || ownerPartyId;
  if (actor !== ownerPartyId && actor !== operational) throw new Error("SECRETARY_TRAVEL_DOCUMENT_ACTOR_NOT_AUTHORIZED");
  return { ownerPartyId, operational, routing };
}

function normalizeKind(value) {
  const kind = text(value, 80).toUpperCase();
  if (!ITEM_KINDS.has(kind)) throw new Error("SECRETARY_TRAVEL_DOCUMENT_ITEM_KIND_INVALID");
  return kind;
}

function normalizeJurisdictions(value) {
  const seen = new Set();
  const rows = [];
  for (const raw of list(value).slice(0, 30)) {
    const item = text(typeof raw === "string" ? raw : object(raw).name || object(raw).jurisdiction, 200);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(item);
  }
  return rows;
}

async function ensureParty(organization, partyId) {
  const id = text(partyId, 120);
  if (!id) return null;
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!party) throw new Error("SECRETARY_TRAVEL_DOCUMENT_RESPONSIBLE_PARTY_NOT_FOUND");
  return id;
}

async function normalizeItem({ organization, jobId, entry, index, actor, evidenceId, occurredAt }) {
  const row = object(entry);
  const label = text(row.label || row.title, 500);
  if (!label) throw new Error(`SECRETARY_TRAVEL_DOCUMENT_ITEM_LABEL_REQUIRED:${index}`);
  const kind = normalizeKind(row.kind);
  const responsiblePartyId = await ensureParty(organization, row.responsible_party_id || row.responsiblePartyId);
  const dueAt = iso(row.due_at || row.dueAt, "item_due_at");
  return {
    item_id: text(row.item_id || row.itemId, 120) || deterministicUuid(`avantiqo-secretary-travel-document-item-v1:${jobId}:${index}:${kind}:${label}`),
    kind,
    label,
    jurisdiction: text(row.jurisdiction, 200) || null,
    required: row.required !== false,
    responsible_party_id: responsiblePartyId,
    due_at: dueAt,
    state: "PENDING",
    expiry_date: null,
    expires_before_departure: false,
    evidence_id: evidenceId || null,
    source_reference: text(row.requirement_source_reference || row.requirementSourceReference, 1800) || null,
    requirement_source: text(row.requirement_source || row.requirementSource, 120) || "EXPLICIT_INSTRUCTION",
    recorded_at: occurredAt || null,
    notes: text(row.notes, 1600) || null,
    history: [],
  };
}

function event(register, { name, evidenceId, occurredAt, actor, payloadSha, version, details = {} }) {
  return [...register.history, {
    event: name,
    evidence_id: evidenceId,
    occurred_at: occurredAt,
    recorded_by_party_id: actor,
    payload_sha256: payloadSha,
    version,
    ...details,
  }].slice(-500);
}

async function mutateLedger({ context, payload = {}, eventName, instruction, producer }) {
  rejectSensitivePayload(payload);
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const jobId = text(payload.job_id || payload.jobId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_TRAVEL_DOCUMENT_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at", { required: true });
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error("SECRETARY_TRAVEL_DOCUMENT_EXPECTED_VERSION_REQUIRED");
  }
  const payloadSha = sha256(payload);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const job = await loadTravelJob(organization, jobId);
    const auth = await authorizeActor({ organization, job, actor, instruction, at: occurredAt });
    const ledger = readLedger(job);
    const replay = ledger.history.find((row) => row.evidence_id === evidenceId);
    if (replay) {
      if (replay.event !== eventName || replay.payload_sha256 !== payloadSha) {
        throw new Error("SECRETARY_TRAVEL_DOCUMENT_EVIDENCE_REUSE_CONFLICT");
      }
      return { job, ledger, auth, replaySafe: true, output: {} };
    }
    if (ledger.version !== expectedVersion) throw new Error("SECRETARY_TRAVEL_DOCUMENT_STALE_VERSION");
    if (ledger.state === "CANCELLED") throw new Error("SECRETARY_TRAVEL_DOCUMENT_CANCELLED");
    const produced = await producer({ job, ledger, auth, actor, organization, evidenceId, occurredAt, payloadSha });
    const nextLedger = { ...produced.ledger, contract: CONTRACT, ...safetyFlags() };
    const metadata = {
      ...object(job.metadata),
      [LEDGER_KEY]: nextLedger,
      travel_document_readiness_contract: CONTRACT,
      travel_document_readiness_state: nextLedger.state,
      travel_document_readiness_version: nextLedger.version,
      ...secretaryAdministrativeCoverageMetadata(auth.routing),
      ...safetyFlags(),
    };
    const updated = await supabaseAdmin.from("secretary_jobs")
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq("organization_id", organization)
      .eq("id", job.id)
      .eq("updated_at", job.updated_at)
      .select("*")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (updated.data) return { job: updated.data, ledger: nextLedger, auth, replaySafe: false, output: object(produced.output) };
  }
  throw new Error("SECRETARY_TRAVEL_DOCUMENT_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

async function preferredActionType(organization, partyId) {
  if (!partyId) return "REVIEW";
  const profile = await one(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("preferred_channel")
      .eq("organization_id", organization)
      .eq("party_id", partyId)
      .maybeSingle(),
  );
  return text(profile?.preferred_channel, 120).toLowerCase().includes("email") ? "EMAIL" : "MESSAGE";
}

function followUpId(jobId, itemId, version) {
  return deterministicUuid(`avantiqo-secretary-travel-document-follow-up-v1:${jobId}:${itemId}:${version}`);
}

async function ensureFollowUp({ organization, job, ledger, item, actor }) {
  if (!item.required || !["PENDING", "MISSING"].includes(item.state) || !item.responsible_party_id) return null;
  const id = followUpId(job.id, item.item_id, ledger.version);
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const dueAt = item.due_at || new Date().toISOString();
  const instruction = [
    `Follow up for the travel-document checklist item \"${text(item.label, 500)}\".`,
    item.jurisdiction ? `Jurisdiction: ${text(item.jurisdiction, 200)}.` : null,
    `Trip departure reference: ${ledger.departure_at}.`,
    "Ask only for explicit evidence that the item is available, missing, or not required. Do not request or store passport numbers, visa numbers, MRZ data, national IDs, passwords, secrets, or full identity-document content.",
    "Do not state that visa eligibility, entry permission, immigration compliance, or legal sufficiency has been established.",
  ].filter(Boolean).join(" ");
  const inserted = await supabaseAdmin.from("secretary_follow_ups").insert({
    id,
    organization_id: organization,
    entity_id: job.entity_id || null,
    owner_party_id: text(object(job.metadata).canonical_owner_party_id, 120) || job.requested_by_party_id || null,
    contact_party_id: item.responsible_party_id,
    task_id: null,
    calendar_event_id: null,
    action_type: await preferredActionType(organization, item.responsible_party_id),
    reason: instruction,
    status: "PENDING",
    due_at: dueAt,
    created_by_party_id: actor,
    metadata: {
      execution_owner: "SECRETARY",
      execution_ready: true,
      execution_instruction: instruction,
      secretary_owned: true,
      secretary_coverage_scope: "TRAVEL_COORDINATION",
      secretary_travel_document_readiness: true,
      secretary_travel_job_id: job.id,
      secretary_travel_document_item_id: item.item_id,
      secretary_travel_document_version: ledger.version,
      sensitive_identity_data_requested: false,
      eligibility_inferred: false,
      external_authority_used: false,
    },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return one(
        supabaseAdmin.from("secretary_follow_ups")
          .select("*")
          .eq("organization_id", organization)
          .eq("id", id)
          .single(),
      );
    }
    throw inserted.error;
  }
  return inserted.data;
}

async function cancelFollowUps({ organization, jobId, itemId = null, reason }) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", organization)
      .eq("status", "PENDING")
      .limit(1000),
  );
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (metadata.secretary_travel_document_readiness !== true) return false;
    if (text(metadata.secretary_travel_job_id, 120) !== text(jobId, 120)) return false;
    if (itemId && text(metadata.secretary_travel_document_item_id, 120) !== text(itemId, 120)) return false;
    return true;
  }).map((row) => row.id);
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  const updated = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "CANCELLED", completed_at: now, result: text(reason, 1200), updated_at: now })
    .eq("organization_id", organization)
    .in("id", ids);
  if (updated.error) throw updated.error;
  return ids.length;
}

export async function startSecretaryTravelDocumentReadiness({ context, payload = {} } = {}) {
  rejectSensitivePayload(payload);
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const jobId = text(payload.job_id || payload.jobId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_TRAVEL_DOCUMENT_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at", { required: true });
  const departureAt = iso(payload.departure_at || payload.departureAt, "departure_at", { required: true });
  const job = await loadTravelJob(organization, jobId);
  const auth = await authorizeActor({ organization, job, actor, instruction: "Start an evidence-backed travel-document readiness checklist.", at: occurredAt });
  const current = readLedger(job);
  const jurisdictions = normalizeJurisdictions(payload.jurisdictions);
  const items = [];
  for (const [index, entry] of list(payload.items).entries()) {
    items.push(await normalizeItem({ organization, jobId, entry, index, actor, evidenceId, occurredAt }));
  }
  if (!items.length) throw new Error("SECRETARY_TRAVEL_DOCUMENT_ITEM_REQUIRED");
  const normalized = { job_id: jobId, departure_at: departureAt, jurisdictions, items: items.map(({ history, ...rest }) => rest), evidence_id: evidenceId, occurred_at: occurredAt };
  const payloadSha = sha256(normalized);
  if (current.version > 0) {
    const replay = current.history.find((row) => row.evidence_id === evidenceId);
    if (replay?.event === "TRAVEL_DOCUMENT_READINESS_STARTED" && replay.payload_sha256 === payloadSha) {
      return { status: "started", contract: CONTRACT, job, register: current, replay_safe: true, ...secretaryAdministrativeCoverageMetadata(auth.routing), ...safetyFlags() };
    }
    throw new Error("SECRETARY_TRAVEL_DOCUMENT_ALREADY_STARTED");
  }
  const ledger = {
    ...emptyLedger(),
    state: "DRAFT",
    version: 1,
    departure_at: departureAt,
    jurisdictions,
    items,
    history: [{ event: "TRAVEL_DOCUMENT_READINESS_STARTED", evidence_id: evidenceId, occurred_at: occurredAt, recorded_by_party_id: actor, payload_sha256: payloadSha, version: 1 }],
  };
  const metadata = {
    ...object(job.metadata),
    [LEDGER_KEY]: ledger,
    travel_document_readiness_contract: CONTRACT,
    travel_document_readiness_state: ledger.state,
    travel_document_readiness_version: ledger.version,
    ...secretaryAdministrativeCoverageMetadata(auth.routing),
    ...safetyFlags(),
  };
  const updated = await supabaseAdmin.from("secretary_jobs")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("organization_id", organization)
    .eq("id", job.id)
    .eq("updated_at", job.updated_at)
    .select("*")
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data) throw new Error("SECRETARY_TRAVEL_DOCUMENT_CONCURRENT_UPDATE_RETRY_REQUIRED");
  return { status: "started", contract: CONTRACT, job: updated.data, register: ledger, replay_safe: false, ...secretaryAdministrativeCoverageMetadata(auth.routing), ...safetyFlags() };
}

export async function addSecretaryTravelDocumentRequirement({ context, payload = {} } = {}) {
  const result = await mutateLedger({
    context,
    payload,
    eventName: "TRAVEL_DOCUMENT_REQUIREMENT_ADDED",
    instruction: "Add an explicitly supplied travel-document requirement to the checklist.",
    producer: async ({ ledger, actor, organization, job, evidenceId, occurredAt, payloadSha }) => {
      if (ledger.state !== "DRAFT") throw new Error("SECRETARY_TRAVEL_DOCUMENT_NOT_DRAFT");
      const item = await normalizeItem({ organization, jobId: job.id, entry: payload, index: ledger.items.length, actor, evidenceId, occurredAt });
      if (ledger.items.some((row) => row.item_id === item.item_id)) throw new Error("SECRETARY_TRAVEL_DOCUMENT_ITEM_DUPLICATE");
      const version = ledger.version + 1;
      return {
        ledger: {
          ...ledger,
          version,
          items: [...ledger.items, item].slice(-100),
          history: event(ledger, { name: "TRAVEL_DOCUMENT_REQUIREMENT_ADDED", evidenceId, occurredAt, actor, payloadSha, version, details: { item_id: item.item_id } }),
        },
        output: { item },
      };
    },
  });
  return { status: "added", contract: CONTRACT, job: result.job, register: result.ledger, item: result.output.item || null, replay_safe: result.replaySafe, ...secretaryAdministrativeCoverageMetadata(result.auth.routing), ...safetyFlags() };
}

export async function recordSecretaryTravelDocumentStatus({ context, payload = {} } = {}) {
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1800);
  if (!sourceReference) throw new Error("SECRETARY_TRAVEL_DOCUMENT_SOURCE_REFERENCE_REQUIRED");
  const state = text(payload.state, 40).toUpperCase();
  if (!ITEM_STATES.has(state) || state === "PENDING") throw new Error("SECRETARY_TRAVEL_DOCUMENT_ITEM_STATE_INVALID");
  const expiryDate = dateOnly(payload.expiry_date || payload.expiryDate, "expiry_date");
  const result = await mutateLedger({
    context,
    payload,
    eventName: "TRAVEL_DOCUMENT_STATUS_RECORDED",
    instruction: "Record explicit evidence about a travel-document checklist item without inferring immigration or legal eligibility.",
    producer: async ({ ledger, actor, evidenceId, occurredAt, payloadSha }) => {
      if (ledger.state !== "DRAFT") throw new Error("SECRETARY_TRAVEL_DOCUMENT_NOT_DRAFT");
      const itemId = text(payload.item_id || payload.itemId, 120);
      const index = ledger.items.findIndex((row) => row.item_id === itemId);
      if (index < 0) throw new Error("SECRETARY_TRAVEL_DOCUMENT_ITEM_NOT_FOUND");
      const previous = ledger.items[index];
      const departureDate = ledger.departure_at ? new Date(ledger.departure_at).toISOString().slice(0, 10) : null;
      const expiresBeforeDeparture = Boolean(expiryDate && departureDate && expiryDate < departureDate);
      const version = ledger.version + 1;
      const items = [...ledger.items];
      items[index] = {
        ...previous,
        state,
        expiry_date: expiryDate,
        expires_before_departure: expiresBeforeDeparture,
        evidence_id: evidenceId,
        source_reference: sourceReference,
        recorded_at: occurredAt,
        notes: text(payload.notes, 1600) || previous.notes || null,
        history: [...list(previous.history), {
          state: previous.state,
          expiry_date: previous.expiry_date || null,
          evidence_id: previous.evidence_id || null,
          source_reference: previous.source_reference || null,
          recorded_at: previous.recorded_at || null,
          superseded_at: occurredAt,
        }].slice(-25),
      };
      return {
        ledger: {
          ...ledger,
          version,
          items,
          history: event(ledger, { name: "TRAVEL_DOCUMENT_STATUS_RECORDED", evidenceId, occurredAt, actor, payloadSha, version, details: { item_id: itemId, state } }),
        },
        output: { item: items[index] },
      };
    },
  });
  if (!result.replaySafe && result.output.item && ["AVAILABLE", "NOT_REQUIRED"].includes(result.output.item.state)) {
    await cancelFollowUps({ organization: organizationId(context), jobId: payload.job_id || payload.jobId, itemId: result.output.item.item_id, reason: "Travel-document item resolved with explicit evidence." });
  }
  return { status: "recorded", contract: CONTRACT, job: result.job, register: result.ledger, item: result.output.item || null, replay_safe: result.replaySafe, ...secretaryAdministrativeCoverageMetadata(result.auth.routing), ...safetyFlags() };
}

export async function refreshSecretaryTravelDocumentFollowUps({ context, payload = {} } = {}) {
  rejectSensitivePayload(payload);
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const job = await loadTravelJob(organization, payload.job_id || payload.jobId);
  const ledger = readLedger(job);
  if (ledger.version < 1) throw new Error("SECRETARY_TRAVEL_DOCUMENT_NOT_STARTED");
  if (ledger.state === "CANCELLED") throw new Error("SECRETARY_TRAVEL_DOCUMENT_CANCELLED");
  const auth = await authorizeActor({ organization, job, actor, instruction: "Refresh missing travel-document follow-ups.", at: new Date().toISOString() });
  const materialized = [];
  for (const item of ledger.items) {
    const row = await ensureFollowUp({ organization, job, ledger, item, actor });
    if (row) materialized.push(row);
  }
  return {
    status: "completed",
    contract: CONTRACT,
    register: ledger,
    follow_up_ids: materialized.map((row) => row.id),
    follow_up_count: materialized.length,
    deterministic_follow_ups: true,
    ...secretaryAdministrativeCoverageMetadata(auth.routing),
    ...safetyFlags(),
  };
}

export async function finalizeSecretaryTravelDocumentReadiness({ context, payload = {} } = {}) {
  const result = await mutateLedger({
    context,
    payload,
    eventName: "TRAVEL_DOCUMENT_READINESS_FINALIZED",
    instruction: "Freeze the administrative travel-document checklist for executive review without making an immigration or legal eligibility determination.",
    producer: async ({ ledger, actor, evidenceId, occurredAt, payloadSha }) => {
      if (ledger.state !== "DRAFT") throw new Error("SECRETARY_TRAVEL_DOCUMENT_NOT_DRAFT");
      const incomplete = ledger.items.filter((item) => item.required && !["AVAILABLE", "NOT_REQUIRED"].includes(item.state));
      if (incomplete.length) throw new Error("SECRETARY_TRAVEL_DOCUMENT_REQUIRED_ITEMS_INCOMPLETE");
      const version = ledger.version + 1;
      const frozen = {
        version,
        finalized_at: occurredAt,
        finalized_by_party_id: actor,
        departure_at: ledger.departure_at,
        jurisdictions: ledger.jurisdictions.map((value) => value),
        items: ledger.items.map((item) => ({ ...item, history: list(item.history).map((row) => ({ ...row })) })),
        administrative_checklist_complete: true,
        entry_eligibility_determined: false,
        legal_sufficiency_determined: false,
      };
      return {
        ledger: {
          ...ledger,
          state: "READY_FOR_REVIEW",
          version,
          frozen_versions: [...ledger.frozen_versions, frozen].slice(-25),
          history: event(ledger, { name: "TRAVEL_DOCUMENT_READINESS_FINALIZED", evidenceId, occurredAt, actor, payloadSha, version }),
        },
      };
    },
  });
  if (!result.replaySafe) await cancelFollowUps({ organization: organizationId(context), jobId: payload.job_id || payload.jobId, reason: "Travel-document checklist finalized for review." });
  return { status: "finalized", contract: CONTRACT, job: result.job, register: result.ledger, replay_safe: result.replaySafe, administrative_checklist_complete: true, entry_eligibility_determined: false, legal_sufficiency_determined: false, ...secretaryAdministrativeCoverageMetadata(result.auth.routing), ...safetyFlags() };
}

export async function reopenSecretaryTravelDocumentReadiness({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 1600);
  if (!reason) throw new Error("SECRETARY_TRAVEL_DOCUMENT_REOPEN_REASON_REQUIRED");
  const result = await mutateLedger({
    context,
    payload,
    eventName: "TRAVEL_DOCUMENT_READINESS_REOPENED",
    instruction: "Reopen a finalized travel-document checklist for explicit correction or new evidence while preserving the frozen prior version.",
    producer: async ({ ledger, actor, evidenceId, occurredAt, payloadSha }) => {
      if (ledger.state !== "READY_FOR_REVIEW") throw new Error("SECRETARY_TRAVEL_DOCUMENT_REOPEN_STATE_INVALID");
      const version = ledger.version + 1;
      return {
        ledger: {
          ...ledger,
          state: "DRAFT",
          version,
          history: event(ledger, { name: "TRAVEL_DOCUMENT_READINESS_REOPENED", evidenceId, occurredAt, actor, payloadSha, version, details: { reason } }),
        },
      };
    },
  });
  return { status: "reopened", contract: CONTRACT, job: result.job, register: result.ledger, replay_safe: result.replaySafe, ...secretaryAdministrativeCoverageMetadata(result.auth.routing), ...safetyFlags() };
}

export async function cancelSecretaryTravelDocumentReadiness({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 1600);
  if (!reason) throw new Error("SECRETARY_TRAVEL_DOCUMENT_CANCEL_REASON_REQUIRED");
  const result = await mutateLedger({
    context,
    payload,
    eventName: "TRAVEL_DOCUMENT_READINESS_CANCELLED",
    instruction: "Cancel only the Secretary travel-document checklist lifecycle without changing the underlying travel job or any external application.",
    producer: async ({ ledger, actor, evidenceId, occurredAt, payloadSha }) => {
      const version = ledger.version + 1;
      return {
        ledger: {
          ...ledger,
          state: "CANCELLED",
          version,
          history: event(ledger, { name: "TRAVEL_DOCUMENT_READINESS_CANCELLED", evidenceId, occurredAt, actor, payloadSha, version, details: { reason } }),
        },
      };
    },
  });
  if (!result.replaySafe) await cancelFollowUps({ organization: organizationId(context), jobId: payload.job_id || payload.jobId, reason });
  return { status: "cancelled", contract: CONTRACT, job: result.job, register: result.ledger, replay_safe: result.replaySafe, travel_job_cancelled: false, external_application_cancelled: false, ...secretaryAdministrativeCoverageMetadata(result.auth.routing), ...safetyFlags() };
}

export async function readSecretaryTravelDocumentReadiness({ context, payload = {} } = {}) {
  rejectSensitivePayload(payload);
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const job = await loadTravelJob(organization, payload.job_id || payload.jobId);
  const ledger = readLedger(job);
  const auth = await authorizeActor({ organization, job, actor, instruction: "Read travel-document readiness status.", at: new Date().toISOString() });
  const incomplete = ledger.items.filter((item) => item.required && !["AVAILABLE", "NOT_REQUIRED"].includes(item.state));
  const expiryWarnings = ledger.items.filter((item) => item.expires_before_departure === true);
  return {
    status: "completed",
    contract: CONTRACT,
    register: ledger,
    required_items_incomplete: incomplete,
    expiry_before_departure_items: expiryWarnings,
    administrative_checklist_complete: ledger.state === "READY_FOR_REVIEW",
    entry_eligibility_determined: false,
    legal_sufficiency_determined: false,
    ...secretaryAdministrativeCoverageMetadata(auth.routing),
    ...safetyFlags(),
  };
}

export async function listSecretaryTravelDocumentReadiness({ context, payload = {} } = {}) {
  rejectSensitivePayload(payload);
  const organization = organizationId(context);
  actorPartyId(context);
  const rows = await many(
    supabaseAdmin.from("secretary_jobs")
      .select("*")
      .eq("organization_id", organization)
      .order("updated_at", { ascending: false })
      .limit(Math.max(1, Math.min(Number(payload.limit) || 100, 500))),
  );
  const registers = rows.map((job) => ({ job, register: readLedger(job) }))
    .filter((row) => row.register.version > 0);
  return { status: "completed", contract: CONTRACT, registers, count: registers.length, ...safetyFlags() };
}

export default Object.freeze({
  start: startSecretaryTravelDocumentReadiness,
  addRequirement: addSecretaryTravelDocumentRequirement,
  recordStatus: recordSecretaryTravelDocumentStatus,
  refresh: refreshSecretaryTravelDocumentFollowUps,
  finalize: finalizeSecretaryTravelDocumentReadiness,
  reopen: reopenSecretaryTravelDocumentReadiness,
  cancel: cancelSecretaryTravelDocumentReadiness,
  read: readSecretaryTravelDocumentReadiness,
  list: listSecretaryTravelDocumentReadiness,
});
