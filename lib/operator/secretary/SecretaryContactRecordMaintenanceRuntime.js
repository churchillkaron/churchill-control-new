import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_CONTACT_RECORD_MAINTENANCE_V1";
const METADATA_KEY = "secretary_contact_record_maintenance_v1";
const MUTABLE_FIELDS = new Set(["display_name", "email", "phone", "legal_name", "address"]);
const CLEARABLE_FIELDS = new Set(["email", "phone", "legal_name", "address"]);

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

function iso(value, field) {
  const raw = text(value, 180);
  if (!raw) throw new Error(`SECRETARY_CONTACT_MAINTENANCE_${field.toUpperCase()}_REQUIRED`);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_CONTACT_MAINTENANCE_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function safetyFlags() {
  return {
    contact_value_inferred: false,
    identity_verified_inferred: false,
    person_created: false,
    party_merged: false,
    party_deleted: false,
    relationship_inferred: false,
    consent_inferred: false,
    communication_sent: false,
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

async function routingFor({ context, at }) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const owner = text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actor;
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId: owner,
    scope: "TASK_ROUTING",
    instruction: "Maintain an existing contact record from explicit evidence only; do not infer identity or relationship facts.",
    at,
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_CONTACT_MAINTENANCE_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_CONTACT_MAINTENANCE_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

async function readParty(organization, partyId) {
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id,organization_id,display_name,legal_name,email,phone,party_type,status,address,metadata,created_at,updated_at")
      .eq("organization_id", organization)
      .eq("id", partyId)
      .maybeSingle(),
  );
  if (!party) throw new Error("SECRETARY_CONTACT_MAINTENANCE_PARTY_NOT_FOUND");
  return party;
}

function historyFromParty(party) {
  const root = object(object(party.metadata)[METADATA_KEY]);
  return {
    contract: CONTRACT,
    history: list(root.history),
    latest_evidence_id: text(root.latest_evidence_id, 500) || null,
    latest_evidence_at: text(root.latest_evidence_at, 180) || null,
    ...safetyFlags(),
  };
}

function normalizeEmail(value) {
  const email = text(value, 500).toLowerCase();
  if (!email) throw new Error("SECRETARY_CONTACT_MAINTENANCE_EMAIL_REQUIRED");
  return email;
}

function normalizePatch(payload = {}) {
  const patch = {};
  const supplied = [
    ["display_name", payload.display_name ?? payload.displayName],
    ["email", payload.email],
    ["phone", payload.phone],
    ["legal_name", payload.legal_name ?? payload.legalName],
    ["address", payload.address],
  ];
  for (const [field, value] of supplied) {
    if (value === undefined) continue;
    if (!MUTABLE_FIELDS.has(field)) continue;
    const cleaned = field === "email" ? normalizeEmail(value) : text(value, field === "address" ? 2000 : 500);
    if (!cleaned) throw new Error(`SECRETARY_CONTACT_MAINTENANCE_${field.toUpperCase()}_REQUIRED`);
    patch[field] = cleaned;
  }

  const clearFields = list(payload.clear_fields || payload.clearFields).map((value) => text(value, 80));
  for (const field of clearFields) {
    if (!CLEARABLE_FIELDS.has(field)) throw new Error(`SECRETARY_CONTACT_MAINTENANCE_CLEAR_FIELD_FORBIDDEN:${field}`);
    if (Object.prototype.hasOwnProperty.call(patch, field)) throw new Error(`SECRETARY_CONTACT_MAINTENANCE_FIELD_SET_AND_CLEAR:${field}`);
    patch[field] = null;
  }
  if (!Object.keys(patch).length) throw new Error("SECRETARY_CONTACT_MAINTENANCE_CHANGE_REQUIRED");
  return patch;
}

async function ensureNoCollision({ organization, partyId, patch }) {
  if (patch.email) {
    const matches = await many(
      supabaseAdmin.from("parties")
        .select("id,display_name,email")
        .eq("organization_id", organization)
        .ilike("email", patch.email)
        .neq("id", partyId)
        .limit(5),
    );
    if (matches.length) throw new Error("SECRETARY_CONTACT_MAINTENANCE_EMAIL_COLLISION");
  }
  if (patch.phone) {
    const matches = await many(
      supabaseAdmin.from("parties")
        .select("id,display_name,phone")
        .eq("organization_id", organization)
        .eq("phone", patch.phone)
        .neq("id", partyId)
        .limit(5),
    );
    if (matches.length) throw new Error("SECRETARY_CONTACT_MAINTENANCE_PHONE_COLLISION");
  }
}

function changedValues(party, patch) {
  const before = {};
  const after = {};
  for (const [field, value] of Object.entries(patch)) {
    const previous = party[field] ?? null;
    if (previous === value) continue;
    before[field] = previous;
    after[field] = value;
  }
  return { before, after };
}

export async function updateSecretaryContactRecord({ context, payload = {} } = {}) {
  const partyId = text(payload.party_id || payload.partyId, 120);
  if (!partyId) throw new Error("SECRETARY_CONTACT_MAINTENANCE_PARTY_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_CONTACT_MAINTENANCE_EVIDENCE_REQUIRED");
  const evidenceAt = iso(payload.evidence_at || payload.evidenceAt, "evidence_at");
  const reason = text(payload.reason, 2000);
  if (!reason) throw new Error("SECRETARY_CONTACT_MAINTENANCE_REASON_REQUIRED");
  const expectedUpdatedAt = iso(payload.expected_updated_at || payload.expectedUpdatedAt, "expected_updated_at");
  const patch = normalizePatch(payload);
  const auth = await routingFor({ context, at: evidenceAt });

  const initial = await readParty(auth.organization, partyId);
  const initialHistory = historyFromParty(initial);
  const replay = initialHistory.history.find((entry) => entry.evidence_id === evidenceId);
  if (replay) {
    return {
      status: "completed",
      contract: CONTRACT,
      party: initial,
      maintenance: initialHistory,
      replay_safe: true,
      changed_fields: Object.keys(object(replay.after)),
      ...safetyFlags(),
    };
  }
  if (initial.updated_at !== expectedUpdatedAt) throw new Error("SECRETARY_CONTACT_MAINTENANCE_STALE_RECORD");
  await ensureNoCollision({ organization: auth.organization, partyId, patch });

  const { before, after } = changedValues(initial, patch);
  if (!Object.keys(after).length) throw new Error("SECRETARY_CONTACT_MAINTENANCE_NO_CHANGE");
  if (Object.prototype.hasOwnProperty.call(after, "display_name") && !after.display_name) {
    throw new Error("SECRETARY_CONTACT_MAINTENANCE_DISPLAY_NAME_REQUIRED");
  }

  const event = {
    event: "CONTACT_RECORD_CORRECTED",
    evidence_id: evidenceId,
    evidence_at: evidenceAt,
    reason,
    recorded_by_party_id: auth.actor,
    before,
    after,
    ...safetyFlags(),
  };
  const nextHistory = [...initialHistory.history, event].slice(-300);
  const nextMetadata = {
    ...object(initial.metadata),
    [METADATA_KEY]: {
      contract: CONTRACT,
      history: nextHistory,
      latest_evidence_id: evidenceId,
      latest_evidence_at: evidenceAt,
      canonical_owner_party_id: auth.owner,
      operational_assignee_party_id: auth.operational,
      ...secretaryAdministrativeCoverageMetadata(auth.routing),
      ...safetyFlags(),
    },
  };
  const now = new Date().toISOString();
  const updatedResult = await supabaseAdmin.from("parties")
    .update({ ...after, metadata: nextMetadata, updated_at: now })
    .eq("organization_id", auth.organization)
    .eq("id", partyId)
    .eq("updated_at", initial.updated_at)
    .select("id,organization_id,display_name,legal_name,email,phone,party_type,status,address,metadata,created_at,updated_at")
    .maybeSingle();
  if (updatedResult.error) throw updatedResult.error;
  if (!updatedResult.data) throw new Error("SECRETARY_CONTACT_MAINTENANCE_CONCURRENT_UPDATE_RETRY_REQUIRED");

  return {
    status: "completed",
    contract: CONTRACT,
    party: updatedResult.data,
    maintenance: historyFromParty(updatedResult.data),
    replay_safe: false,
    changed_fields: Object.keys(after),
    ...safetyFlags(),
  };
}

export async function readSecretaryContactRecordMaintenance({ context, payload = {} } = {}) {
  const partyId = text(payload.party_id || payload.partyId, 120);
  if (!partyId) throw new Error("SECRETARY_CONTACT_MAINTENANCE_PARTY_REQUIRED");
  const organization = organizationId(context);
  actorPartyId(context);
  const party = await readParty(organization, partyId);
  return {
    status: "completed",
    contract: CONTRACT,
    party,
    maintenance: historyFromParty(party),
    ...safetyFlags(),
  };
}

export default {
  updateSecretaryContactRecord,
  readSecretaryContactRecordMaintenance,
};
