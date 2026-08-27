import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_TRAVEL_OPERATIONS_V1";
const LEDGER_KEY = "travel_operations_v1";
const CONFIRMATION_KINDS = new Set(["FLIGHT", "TRAIN", "FERRY", "GROUND_TRANSPORT", "HOTEL", "MEETING", "OTHER"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function iso(value, field, { required = false } = {}) {
  const clean = text(value, 160);
  if (!clean) {
    if (required) throw new Error(`SECRETARY_TRAVEL_OPERATIONS_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(clean);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_TRAVEL_OPERATIONS_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function actorPartyId(context = {}) {
  const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return id;
}

function organizationId(context = {}) {
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

function deterministicId(seed) {
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
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

function emptyLedger() {
  return {
    contract: CONTRACT,
    version: 0,
    confirmations: [],
    disruptions: [],
    history: [],
    researched_option_is_confirmation: false,
    booking_authority_created: false,
    payment_authority_created: false,
    binding_authority_created: false,
    external_authority_used: false,
  };
}

function readLedger(job) {
  const raw = object(object(job.metadata)[LEDGER_KEY]);
  if (raw.contract !== CONTRACT) return emptyLedger();
  return {
    ...emptyLedger(),
    ...raw,
    confirmations: list(raw.confirmations),
    disruptions: list(raw.disruptions),
    history: list(raw.history),
  };
}

async function loadTravelJob(organization, jobId) {
  const id = text(jobId, 120);
  if (!id) throw new Error("SECRETARY_TRAVEL_OPERATIONS_JOB_REQUIRED");
  const job = await one(
    supabaseAdmin.from("secretary_jobs")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!job) throw new Error("SECRETARY_TRAVEL_OPERATIONS_JOB_NOT_FOUND");
  if (text(object(job.metadata).job_kind, 80).toUpperCase() !== "TRAVEL_COORDINATION") {
    throw new Error("SECRETARY_TRAVEL_OPERATIONS_JOB_KIND_INVALID");
  }
  return job;
}

async function authorizeOperationalActor({ organization, job, actor, instruction }) {
  const ownerPartyId = text(object(job.metadata).canonical_owner_party_id, 120) || text(job.requested_by_party_id, 120);
  if (!ownerPartyId) throw new Error("SECRETARY_TRAVEL_OPERATIONS_CANONICAL_OWNER_REQUIRED");
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId,
    scope: "TRAVEL_COORDINATION",
    instruction,
    requiresOwnerAuthority: false,
    at: new Date().toISOString(),
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_TRAVEL_OPERATIONS_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || ownerPartyId;
  if (actor !== ownerPartyId && actor !== operational) throw new Error("SECRETARY_TRAVEL_OPERATIONS_ACTOR_NOT_AUTHORIZED");
  return { ownerPartyId, operational, routing };
}

async function mutateLedger({ context, jobId, instruction, producer }) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const job = await loadTravelJob(organization, jobId);
    const auth = await authorizeOperationalActor({ organization, job, actor, instruction });
    const ledger = readLedger(job);
    const produced = await producer({ job, ledger, actor, ...auth });
    const nextLedger = {
      ...produced.ledger,
      contract: CONTRACT,
      researched_option_is_confirmation: false,
      booking_authority_created: false,
      payment_authority_created: false,
      binding_authority_created: false,
      external_authority_used: false,
    };
    const metadata = {
      ...object(job.metadata),
      [LEDGER_KEY]: nextLedger,
      travel_operations_contract: CONTRACT,
      travel_operations_version: nextLedger.version,
      ...secretaryAdministrativeCoverageMetadata(auth.routing),
      researched_option_is_confirmation: false,
      booking_authority_created: false,
      payment_authority_created: false,
      binding_authority_created: false,
      approval_authority_delegated: false,
      platform_permissions_mutated: false,
      external_authority_used: false,
    };
    const updated = await supabaseAdmin.from("secretary_jobs")
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq("organization_id", organization)
      .eq("id", job.id)
      .eq("updated_at", job.updated_at)
      .select("*")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (updated.data) return { job: updated.data, ledger: nextLedger, output: object(produced.output), auth };
  }
  throw new Error("SECRETARY_TRAVEL_OPERATIONS_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

function confirmationPayload(payload = {}) {
  const kind = text(payload.kind, 80).toUpperCase();
  if (!CONFIRMATION_KINDS.has(kind)) throw new Error("SECRETARY_TRAVEL_OPERATIONS_CONFIRMATION_KIND_INVALID");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_TRAVEL_OPERATIONS_CONFIRMATION_EVIDENCE_REQUIRED");
  const reference = text(payload.confirmation_reference || payload.confirmationReference, 500);
  if (!reference) throw new Error("SECRETARY_TRAVEL_OPERATIONS_CONFIRMATION_REFERENCE_REQUIRED");
  const startsAt = iso(payload.starts_at || payload.startsAt, "starts_at");
  const endsAt = iso(payload.ends_at || payload.endsAt, "ends_at");
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new Error("SECRETARY_TRAVEL_OPERATIONS_CONFIRMATION_WINDOW_INVALID");
  }
  return {
    kind,
    title: text(payload.title, 500) || kind,
    confirmation_reference: reference,
    provider_name: text(payload.provider_name || payload.providerName, 500) || null,
    starts_at: startsAt,
    ends_at: endsAt,
    timezone: text(payload.timezone, 120) || null,
    origin: text(payload.origin, 1000) || null,
    destination: text(payload.destination, 1000) || null,
    location: text(payload.location, 1000) || null,
    evidence_id: evidenceId,
    source_reference: text(payload.source_reference || payload.sourceReference, 1000) || null,
    notes: text(payload.notes, 3000) || null,
  };
}

export async function recordSecretaryTravelConfirmation({ context, payload = {} } = {}) {
  const item = confirmationPayload(payload);
  const jobId = payload.job_id || payload.jobId;
  const result = await mutateLedger({
    context,
    jobId,
    instruction: `Record confirmed travel evidence ${item.kind}`,
    producer: async ({ ledger, actor, ownerPartyId }) => {
      const confirmationId = deterministicId(`${jobId}:${item.kind}:${item.confirmation_reference}:${item.evidence_id}`);
      const existing = ledger.confirmations.find((row) => row.confirmation_id === confirmationId);
      if (existing) return { ledger, output: { replay_safe: true, confirmation: existing } };
      const version = Number(ledger.version || 0) + 1;
      const confirmation = {
        confirmation_id: confirmationId,
        ...item,
        status: "CONFIRMED",
        version,
        recorded_at: new Date().toISOString(),
        recorded_by_party_id: actor,
        canonical_owner_party_id: ownerPartyId,
        confirmation_inferred: false,
      };
      const history = [...ledger.history, { event: "CONFIRMATION_RECORDED", version, confirmation_id: confirmationId, evidence_id: item.evidence_id }].slice(-1000);
      return {
        ledger: { ...ledger, version, confirmations: [...ledger.confirmations, confirmation].slice(-500), history },
        output: { replay_safe: false, confirmation },
      };
    },
  });
  return {
    status: "recorded",
    contract: CONTRACT,
    confirmation: result.output.confirmation,
    replay_safe: result.output.replay_safe === true,
    register_version: result.ledger.version,
    confirmation_inferred: false,
    booking_authority_created: false,
    payment_authority_created: false,
    external_authority_used: false,
  };
}

export async function recordSecretaryTravelDisruption({ context, payload = {} } = {}) {
  const jobId = payload.job_id || payload.jobId;
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const description = text(payload.description, 3000);
  if (!evidenceId) throw new Error("SECRETARY_TRAVEL_OPERATIONS_DISRUPTION_EVIDENCE_REQUIRED");
  if (!description) throw new Error("SECRETARY_TRAVEL_OPERATIONS_DISRUPTION_DESCRIPTION_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt || new Date().toISOString(), "occurred_at", { required: true });
  const result = await mutateLedger({
    context,
    jobId,
    instruction: "Record evidenced travel disruption",
    producer: async ({ ledger, actor, ownerPartyId }) => {
      const disruptionId = deterministicId(`${jobId}:${evidenceId}:${occurredAt}:${description}`);
      const existing = ledger.disruptions.find((row) => row.disruption_id === disruptionId);
      if (existing) return { ledger, output: { replay_safe: true, disruption: existing } };
      const version = Number(ledger.version || 0) + 1;
      const disruption = {
        disruption_id: disruptionId,
        evidence_id: evidenceId,
        description,
        occurred_at: occurredAt,
        affected_confirmation_id: text(payload.affected_confirmation_id || payload.affectedConfirmationId, 120) || null,
        source_reference: text(payload.source_reference || payload.sourceReference, 1000) || null,
        recorded_at: new Date().toISOString(),
        recorded_by_party_id: actor,
        canonical_owner_party_id: ownerPartyId,
        impact_inferred: false,
      };
      const history = [...ledger.history, { event: "DISRUPTION_RECORDED", version, disruption_id: disruptionId, evidence_id: evidenceId }].slice(-1000);
      return {
        ledger: { ...ledger, version, disruptions: [...ledger.disruptions, disruption].slice(-500), history },
        output: { replay_safe: false, disruption },
      };
    },
  });
  return {
    status: "recorded",
    contract: CONTRACT,
    disruption: result.output.disruption,
    replay_safe: result.output.replay_safe === true,
    register_version: result.ledger.version,
    impact_inferred: false,
    external_authority_used: false,
  };
}

export async function createSecretaryTravelReminder({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const job = await loadTravelJob(organization, payload.job_id || payload.jobId);
  const auth = await authorizeOperationalActor({ organization, job, actor, instruction: "Create travel operations reminder" });
  const title = text(payload.title, 500);
  const dueAt = iso(payload.due_at || payload.dueAt, "due_at", { required: true });
  if (!title) throw new Error("SECRETARY_TRAVEL_OPERATIONS_REMINDER_TITLE_REQUIRED");
  const reminderKey = deterministicId(`${job.id}:${title}:${dueAt}`);
  const existing = await many(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("source", "secretary_travel_operations")
      .contains("metadata", { secretary_travel_reminder_key: reminderKey })
      .limit(2),
  );
  if (existing.length) {
    return { status: "completed", contract: CONTRACT, reminder: existing[0], replay_safe: true, external_authority_used: false };
  }
  const reminder = await one(
    supabaseAdmin.from("secretary_tasks").insert({
      organization_id: organization,
      entity_id: job.entity_id || null,
      owner_party_id: auth.ownerPartyId,
      title,
      details: text(payload.details, 3000) || null,
      status: "OPEN",
      priority: text(payload.priority, 40).toUpperCase() || "NORMAL",
      due_at: dueAt,
      remind_at: iso(payload.remind_at || payload.remindAt, "remind_at") || dueAt,
      source: "secretary_travel_operations",
      created_by_party_id: actor,
      metadata: {
        secretary_travel_job_id: job.id,
        secretary_travel_reminder_key: reminderKey,
        canonical_owner_party_id: auth.ownerPartyId,
        operational_assignee_party_id: auth.operational,
        ...secretaryAdministrativeCoverageMetadata(auth.routing),
        timestamp_inferred: false,
        booking_authority_created: false,
        payment_authority_created: false,
        external_authority_used: false,
      },
    }).select("*").single(),
  );
  return {
    status: "completed",
    contract: CONTRACT,
    reminder,
    replay_safe: false,
    timestamp_inferred: false,
    booking_authority_created: false,
    payment_authority_created: false,
    external_authority_used: false,
  };
}

export async function readSecretaryTravelOperations({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const job = await loadTravelJob(organization, payload.job_id || payload.jobId);
  const ledger = readLedger(job);
  const [steps, reminders] = await Promise.all([
    many(
      supabaseAdmin.from("secretary_job_steps")
        .select("*")
        .eq("organization_id", organization)
        .eq("job_id", job.id)
        .order("sequence_number", { ascending: true }),
    ),
    many(
      supabaseAdmin.from("secretary_tasks")
        .select("*")
        .eq("organization_id", organization)
        .eq("source", "secretary_travel_operations")
        .contains("metadata", { secretary_travel_job_id: job.id })
        .order("due_at", { ascending: true, nullsFirst: false }),
    ),
  ]);
  const confirmations = [...ledger.confirmations].sort((a, b) => {
    const left = a.starts_at ? Date.parse(a.starts_at) : Number.MAX_SAFE_INTEGER;
    const right = b.starts_at ? Date.parse(b.starts_at) : Number.MAX_SAFE_INTEGER;
    return left - right;
  });
  const outstandingApprovalSteps = steps.filter((step) => step.status === "APPROVAL_REQUIRED" || step.requires_approval === true);
  const unresolvedSteps = steps.filter((step) => !["COMPLETED", "SKIPPED"].includes(step.status));
  return {
    status: "completed",
    contract: CONTRACT,
    job: {
      id: job.id,
      status: job.status,
      objective: job.objective,
      result_summary: job.result_summary,
      next_action_at: job.next_action_at,
      canonical_owner_party_id: text(object(job.metadata).canonical_owner_party_id, 120) || job.requested_by_party_id || null,
      travel_coordination: object(job.metadata).travel_coordination || {},
    },
    itinerary: confirmations,
    disruptions: ledger.disruptions,
    reminders,
    unresolved_steps: unresolvedSteps,
    approval_required_steps: outstandingApprovalSteps,
    evidence_summary: {
      confirmed_items: confirmations.length,
      disruptions: ledger.disruptions.length,
      reminders: reminders.length,
      unresolved_steps: unresolvedSteps.length,
      approval_required_steps: outstandingApprovalSteps.length,
    },
    researched_option_is_confirmation: false,
    booking_authority_created: false,
    payment_authority_created: false,
    binding_authority_created: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  read: readSecretaryTravelOperations,
  recordConfirmation: recordSecretaryTravelConfirmation,
  recordDisruption: recordSecretaryTravelDisruption,
  createReminder: createSecretaryTravelReminder,
});
