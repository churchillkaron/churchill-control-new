import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_RELATIONSHIP_MEMORY_V1";
const MEMORY_KEY = "relationship_memory_v1";
const FORBIDDEN_MEMORY_KEY = /(password|passcode|pin\b|otp\b|one.?time|api.?key|private.?key|secret|security.?answer|access.?token|refresh.?token|credential)/i;

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

function partyId(payload = {}) {
  const id = text(payload.party_id || payload.partyId || payload.contact_party_id || payload.contactPartyId, 120);
  if (!id) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_PARTY_REQUIRED");
  return id;
}

function iso(value, field, { required = false } = {}) {
  const raw = text(value, 160);
  if (!raw) {
    if (required) throw new Error(`SECRETARY_RELATIONSHIP_MEMORY_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_RELATIONSHIP_MEMORY_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
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

function factId(organization, contactId, evidenceId, key, value) {
  return deterministicUuid(`secretary-relationship-fact-v1:${organization}:${contactId}:${evidenceId}:${key}:${stableJson(value)}`);
}

function interactionId(organization, contactId, evidenceId) {
  return deterministicUuid(`secretary-relationship-interaction-v1:${organization}:${contactId}:${evidenceId}`);
}

function nextTouchId(organization, contactId, dueAt, reason) {
  return deterministicUuid(`secretary-relationship-next-touch-v1:${organization}:${contactId}:${dueAt}:${reason}`);
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

async function assertPartyExists(organization, contactId) {
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id,display_name,email,phone,party_type,status,legal_name")
      .eq("organization_id", organization)
      .eq("id", contactId)
      .maybeSingle(),
  );
  if (!party) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_PARTY_NOT_FOUND");
  return party;
}

function normalizeMemory(metadata = {}) {
  const current = object(object(metadata)[MEMORY_KEY]);
  return {
    contract: CONTRACT,
    facts: list(current.facts),
    interactions: list(current.interactions),
    corrections: list(current.corrections),
    relationship_memory_evidence_required: true,
    facts_not_inferred: true,
    stale_facts_not_treated_current: true,
    credentials_or_secrets_stored: false,
    external_authority_used: false,
  };
}

async function ensureProfile(organization, contactId) {
  let profile = await one(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("*")
      .eq("organization_id", organization)
      .eq("party_id", contactId)
      .maybeSingle(),
  );
  if (profile) return profile;
  const inserted = await supabaseAdmin.from("secretary_contact_profiles").insert({
    organization_id: organization,
    party_id: contactId,
    metadata: { [MEMORY_KEY]: normalizeMemory({}) },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code !== "23505") throw inserted.error;
    profile = await one(
      supabaseAdmin.from("secretary_contact_profiles").select("*")
        .eq("organization_id", organization).eq("party_id", contactId).single(),
    );
    return profile;
  }
  return inserted.data;
}

async function mutateProfile(organization, contactId, producer) {
  await assertPartyExists(organization, contactId);
  await ensureProfile(organization, contactId);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const profile = await one(
      supabaseAdmin.from("secretary_contact_profiles").select("*")
        .eq("organization_id", organization).eq("party_id", contactId).single(),
    );
    const produced = await producer(profile, normalizeMemory(profile.metadata));
    const metadata = { ...object(profile.metadata), [MEMORY_KEY]: produced.memory };
    const patch = { ...object(produced.profile_patch), metadata, updated_at: new Date().toISOString() };
    const updated = await supabaseAdmin.from("secretary_contact_profiles")
      .update(patch)
      .eq("organization_id", organization)
      .eq("party_id", contactId)
      .eq("updated_at", profile.updated_at)
      .select("*")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (updated.data) return { profile: updated.data, output: object(produced.output) };
  }
  throw new Error("SECRETARY_RELATIONSHIP_MEMORY_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

function assertMemoryKey(key) {
  const clean = text(key, 180);
  if (!clean) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_FACT_KEY_REQUIRED");
  if (FORBIDDEN_MEMORY_KEY.test(clean)) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_CREDENTIAL_STORAGE_FORBIDDEN");
  return clean;
}

function explicitValue(payload = {}) {
  if (!("value" in payload)) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_FACT_VALUE_REQUIRED");
  const value = payload.value;
  if (value === undefined) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_FACT_VALUE_REQUIRED");
  const serialized = stableJson(value);
  if (serialized.length > 8000) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_FACT_VALUE_TOO_LARGE");
  return value;
}

function viewFact(fact, nowMs = Date.now()) {
  if (!fact || typeof fact !== "object") return fact;
  if (fact.status !== "CURRENT") return fact;
  const validUntil = Date.parse(fact.valid_until || "");
  if (Number.isFinite(validUntil) && validUntil < nowMs) {
    return { ...fact, effective_status: "STALE", stale: true };
  }
  return { ...fact, effective_status: "CURRENT", stale: false };
}

export async function recordSecretaryRelationshipFact({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const contactId = partyId(payload);
  const key = assertMemoryKey(payload.fact_key || payload.factKey || payload.key);
  const value = explicitValue(payload);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  if (!evidenceId) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_FACT_EVIDENCE_REQUIRED");
  const observedAt = iso(payload.observed_at || payload.observedAt, "observed_at") || new Date().toISOString();
  const validUntil = iso(payload.valid_until || payload.validUntil, "valid_until");
  const id = factId(organization, contactId, evidenceId, key, value);

  const changed = await mutateProfile(organization, contactId, async (_profile, memory) => {
    const duplicate = memory.facts.find((fact) => fact.id === id || fact.evidence_id === evidenceId);
    if (duplicate) return { memory, output: { fact: duplicate, idempotent: true } };
    const now = new Date().toISOString();
    const nextFacts = memory.facts.map((fact) => fact.status === "CURRENT" && fact.key === key
      ? { ...fact, status: "SUPERSEDED", superseded_at: now, superseded_by_fact_id: id }
      : fact);
    const fact = {
      id,
      key,
      value,
      category: text(payload.category, 120).toUpperCase() || "GENERAL",
      status: "CURRENT",
      evidence_id: evidenceId,
      source_reference: text(payload.source_reference || payload.sourceReference, 1600) || null,
      observed_at: observedAt,
      valid_until: validUntil,
      recorded_at: now,
      recorded_by_party_id: actor,
      notes: text(payload.notes, 1200) || null,
      inferred: false,
    };
    nextFacts.push(fact);
    return {
      memory: { ...memory, facts: nextFacts.slice(-250), facts_not_inferred: true, credentials_or_secrets_stored: false, external_authority_used: false },
      output: { fact, idempotent: false },
    };
  });

  return {
    status: changed.output.idempotent ? "fact_already_recorded" : "fact_recorded",
    contract: CONTRACT,
    profile: changed.profile,
    fact: viewFact(changed.output.fact),
    idempotent: changed.output.idempotent,
    prior_fact_preserved_when_superseded: true,
    fact_inferred: false,
    credentials_or_secrets_stored: false,
    external_authority_used: false,
  };
}

export async function correctSecretaryRelationshipFact({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const contactId = partyId(payload);
  const targetId = text(payload.fact_id || payload.factId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  const reason = text(payload.reason, 1600);
  if (!targetId) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_FACT_ID_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_CORRECTION_EVIDENCE_REQUIRED");
  if (!reason) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_CORRECTION_REASON_REQUIRED");
  const value = explicitValue(payload);

  const changed = await mutateProfile(organization, contactId, async (_profile, memory) => {
    const target = memory.facts.find((fact) => fact.id === targetId);
    if (!target) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_FACT_NOT_FOUND");
    const duplicateCorrection = memory.corrections.find((row) => row.evidence_id === evidenceId);
    if (duplicateCorrection) {
      const existing = memory.facts.find((fact) => fact.id === duplicateCorrection.replacement_fact_id) || null;
      return { memory, output: { fact: existing, idempotent: true } };
    }
    assertMemoryKey(target.key);
    const replacementId = factId(organization, contactId, evidenceId, target.key, value);
    const now = new Date().toISOString();
    const replacement = {
      ...target,
      id: replacementId,
      value,
      status: "CURRENT",
      evidence_id: evidenceId,
      source_reference: text(payload.source_reference || payload.sourceReference, 1600) || null,
      observed_at: iso(payload.observed_at || payload.observedAt, "observed_at") || now,
      valid_until: payload.valid_until !== undefined || payload.validUntil !== undefined ? iso(payload.valid_until || payload.validUntil, "valid_until") : target.valid_until || null,
      recorded_at: now,
      recorded_by_party_id: actor,
      notes: text(payload.notes, 1200) || null,
      corrected_from_fact_id: target.id,
      inferred: false,
      superseded_at: undefined,
      superseded_by_fact_id: undefined,
    };
    const facts = memory.facts.map((fact) => fact.id === target.id
      ? { ...fact, status: "CORRECTED", corrected_at: now, corrected_by_fact_id: replacementId }
      : (fact.status === "CURRENT" && fact.key === target.key ? { ...fact, status: "SUPERSEDED", superseded_at: now, superseded_by_fact_id: replacementId } : fact));
    facts.push(replacement);
    const correction = { evidence_id: evidenceId, reason, target_fact_id: target.id, replacement_fact_id: replacementId, corrected_at: now, corrected_by_party_id: actor };
    return {
      memory: { ...memory, facts: facts.slice(-250), corrections: [...memory.corrections, correction].slice(-100), facts_not_inferred: true, external_authority_used: false },
      output: { fact: replacement, idempotent: false },
    };
  });

  return {
    status: changed.output.idempotent ? "correction_already_recorded" : "fact_corrected",
    profile: changed.profile,
    fact: viewFact(changed.output.fact),
    idempotent: changed.output.idempotent,
    original_fact_deleted: false,
    fact_inferred: false,
    external_authority_used: false,
  };
}

export async function retractSecretaryRelationshipFact({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const contactId = partyId(payload);
  const targetId = text(payload.fact_id || payload.factId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  const reason = text(payload.reason, 1600);
  if (!targetId) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_FACT_ID_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_RETRACTION_EVIDENCE_REQUIRED");
  if (!reason) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_RETRACTION_REASON_REQUIRED");

  const changed = await mutateProfile(organization, contactId, async (_profile, memory) => {
    const target = memory.facts.find((fact) => fact.id === targetId);
    if (!target) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_FACT_NOT_FOUND");
    if (target.status === "RETRACTED" && target.retraction_evidence_id === evidenceId) return { memory, output: { fact: target, idempotent: true } };
    const now = new Date().toISOString();
    const facts = memory.facts.map((fact) => fact.id === targetId ? {
      ...fact,
      status: "RETRACTED",
      retraction_evidence_id: evidenceId,
      retraction_reason: reason,
      retracted_at: now,
      retracted_by_party_id: actor,
    } : fact);
    return { memory: { ...memory, facts, external_authority_used: false }, output: { fact: facts.find((fact) => fact.id === targetId), idempotent: false } };
  });

  return {
    status: changed.output.idempotent ? "retraction_already_recorded" : "fact_retracted",
    profile: changed.profile,
    fact: changed.output.fact,
    fact_deleted: false,
    evidence_preserved: true,
    external_authority_used: false,
  };
}

export async function recordSecretaryRelationshipInteraction({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const contactId = partyId(payload);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  if (!evidenceId) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_INTERACTION_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at", { required: true });
  const summary = text(payload.summary, 2400);
  if (!summary) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_INTERACTION_SUMMARY_REQUIRED");
  const id = interactionId(organization, contactId, evidenceId);

  const changed = await mutateProfile(organization, contactId, async (profile, memory) => {
    const duplicate = memory.interactions.find((row) => row.id === id || row.evidence_id === evidenceId);
    if (duplicate) return { memory, output: { interaction: duplicate, idempotent: true } };
    const interaction = {
      id,
      evidence_id: evidenceId,
      occurred_at: occurredAt,
      kind: text(payload.kind || payload.interaction_type || payload.interactionType, 100).toUpperCase() || "OTHER",
      channel: text(payload.channel, 100).toUpperCase() || null,
      direction: text(payload.direction, 40).toUpperCase() || null,
      summary,
      source_reference: text(payload.source_reference || payload.sourceReference, 1600) || null,
      recorded_at: new Date().toISOString(),
      recorded_by_party_id: actor,
      inferred: false,
    };
    const previousLast = Date.parse(profile.last_contact_at || "");
    const interactionTime = Date.parse(occurredAt);
    const nextLastContact = !Number.isFinite(previousLast) || interactionTime > previousLast ? occurredAt : profile.last_contact_at;
    return {
      memory: { ...memory, interactions: [...memory.interactions, interaction].slice(-150), external_authority_used: false },
      profile_patch: { last_contact_at: nextLastContact },
      output: { interaction, idempotent: false, last_contact_at: nextLastContact },
    };
  });

  return {
    status: changed.output.idempotent ? "interaction_already_recorded" : "interaction_recorded",
    profile: changed.profile,
    interaction: changed.output.interaction,
    idempotent: changed.output.idempotent,
    last_contact_at: changed.profile.last_contact_at,
    interaction_inferred: false,
    external_authority_used: false,
  };
}

async function preferredActionType(profile) {
  const preferred = text(profile?.preferred_channel, 80).toLowerCase();
  if (preferred.includes("email")) return "EMAIL";
  if (profile?.allow_messages !== false) return "MESSAGE";
  if (profile?.allow_calls !== false) return "CALL";
  return "REVIEW";
}

export async function setSecretaryRelationshipNextTouch({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const contactId = partyId(payload);
  const dueAt = iso(payload.due_at || payload.dueAt, "due_at", { required: true });
  const reason = text(payload.reason, 1800);
  if (!reason) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_NEXT_TOUCH_REASON_REQUIRED");
  await assertPartyExists(organization, contactId);
  const profile = await ensureProfile(organization, contactId);
  const id = nextTouchId(organization, contactId, dueAt, reason);
  let followUp = await one(
    supabaseAdmin.from("secretary_follow_ups").select("*")
      .eq("organization_id", organization).eq("id", id).maybeSingle(),
  );
  if (!followUp) {
    const inserted = await supabaseAdmin.from("secretary_follow_ups").insert({
      id,
      organization_id: organization,
      owner_party_id: actor,
      contact_party_id: contactId,
      action_type: await preferredActionType(profile),
      reason,
      status: "PENDING",
      due_at: dueAt,
      created_by_party_id: actor,
      metadata: {
        secretary_owned: true,
        execution_owner: "SECRETARY",
        execution_ready: true,
        execution_instruction: `Follow up with this contact for the recorded relationship reason: ${reason}`,
        secretary_relationship_memory: true,
        secretary_relationship_next_touch: true,
        external_authority_used: false,
      },
    }).select("*").single();
    if (inserted.error) {
      if (inserted.error.code !== "23505") throw inserted.error;
      followUp = await one(supabaseAdmin.from("secretary_follow_ups").select("*").eq("organization_id", organization).eq("id", id).single());
    } else followUp = inserted.data;
  }
  const updated = await mutateProfile(organization, contactId, async (_current, memory) => ({
    memory: { ...memory, next_touch: { follow_up_id: id, due_at: dueAt, reason, set_at: new Date().toISOString(), set_by_party_id: actor }, external_authority_used: false },
    profile_patch: { next_follow_up_at: dueAt },
  }));
  return {
    status: "next_touch_set",
    contract: CONTRACT,
    profile: updated.profile,
    follow_up: followUp,
    deterministic_follow_up_id: id,
    external_authority_used: false,
  };
}

export async function clearSecretaryRelationshipNextTouch({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const contactId = partyId(payload);
  const reason = text(payload.reason, 1000) || "Relationship next-touch cleared.";
  const profile = await ensureProfile(organization, contactId);
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups").select("id,metadata")
      .eq("organization_id", organization)
      .eq("contact_party_id", contactId)
      .eq("status", "PENDING")
      .limit(200),
  );
  const ids = rows.filter((row) => object(row.metadata).secretary_relationship_next_touch === true).map((row) => row.id);
  if (ids.length) {
    const now = new Date().toISOString();
    const result = await supabaseAdmin.from("secretary_follow_ups")
      .update({ status: "CANCELLED", completed_at: now, result: reason, updated_at: now })
      .eq("organization_id", organization).in("id", ids);
    if (result.error) throw result.error;
  }
  const changed = await mutateProfile(organization, contactId, async (_current, memory) => ({
    memory: { ...memory, next_touch: null, external_authority_used: false },
    profile_patch: { next_follow_up_at: null },
  }));
  return {
    status: "next_touch_cleared",
    profile: changed.profile,
    cancelled_follow_up_ids: ids,
    previous_next_follow_up_at: profile.next_follow_up_at,
    external_authority_used: false,
  };
}

export async function readSecretaryRelationshipMemory({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const contactId = partyId(payload);
  const party = await assertPartyExists(organization, contactId);
  const profile = await ensureProfile(organization, contactId);
  const memory = normalizeMemory(profile.metadata);
  const limit = Math.min(50, Math.max(1, Number(payload.recent_limit || payload.recentLimit || 10)));
  const [calls, meetings, followUps, tasks] = await Promise.all([
    many(supabaseAdmin.from("secretary_calls").select("id,direction,status,started_at,ended_at,summary,metadata").eq("organization_id", organization).eq("contact_party_id", contactId).order("started_at", { ascending: false }).limit(limit)),
    many(supabaseAdmin.from("secretary_calendar_events").select("id,title,event_type,status,starts_at,ends_at,location,metadata").eq("organization_id", organization).eq("contact_party_id", contactId).order("starts_at", { ascending: false }).limit(limit)),
    many(supabaseAdmin.from("secretary_follow_ups").select("id,action_type,reason,status,due_at,result,metadata").eq("organization_id", organization).eq("contact_party_id", contactId).order("due_at", { ascending: false }).limit(limit)),
    many(supabaseAdmin.from("secretary_tasks").select("id,title,details,status,priority,due_at,metadata").eq("organization_id", organization).eq("contact_party_id", contactId).order("updated_at", { ascending: false }).limit(limit)),
  ]);
  const facts = memory.facts.map((fact) => viewFact(fact));
  return {
    status: "read",
    contract: CONTRACT,
    party,
    profile: {
      id: profile.id,
      party_id: profile.party_id,
      relationship_label: profile.relationship_label,
      preferred_language: profile.preferred_language,
      timezone: profile.timezone,
      preferred_channel: profile.preferred_channel,
      allow_calls: profile.allow_calls,
      allow_messages: profile.allow_messages,
      do_not_disturb: profile.do_not_disturb,
      important_notes: profile.important_notes,
      last_contact_at: profile.last_contact_at,
      next_follow_up_at: profile.next_follow_up_at,
      updated_at: profile.updated_at,
    },
    current_facts: facts.filter((fact) => fact.status === "CURRENT" && fact.effective_status === "CURRENT"),
    stale_facts: facts.filter((fact) => fact.status === "CURRENT" && fact.effective_status === "STALE"),
    fact_history: facts,
    interaction_history: memory.interactions,
    correction_history: memory.corrections,
    next_touch: memory.next_touch || null,
    recent_evidence: { calls, meetings, follow_ups: followUps, tasks },
    facts_not_inferred: true,
    stale_facts_not_treated_current: true,
    credentials_or_secrets_stored: false,
    external_authority_used: false,
  };
}

export async function listSecretaryRelationshipAttention({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const now = iso(payload.now, "now") || new Date().toISOString();
  const through = iso(payload.through, "through") || new Date(Date.parse(now) + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (Date.parse(through) < Date.parse(now)) throw new Error("SECRETARY_RELATIONSHIP_MEMORY_ATTENTION_WINDOW_INVALID");
  const profiles = await many(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("id,party_id,relationship_label,last_contact_at,next_follow_up_at,preferred_channel,allow_calls,allow_messages,metadata,updated_at")
      .eq("organization_id", organization)
      .not("next_follow_up_at", "is", null)
      .lte("next_follow_up_at", through)
      .order("next_follow_up_at", { ascending: true })
      .limit(Math.min(300, Math.max(1, Number(payload.limit || 100)))),
  );
  const partyIds = profiles.map((row) => row.party_id).filter(Boolean);
  const parties = partyIds.length ? await many(
    supabaseAdmin.from("parties").select("id,display_name,email,phone,party_type,status")
      .eq("organization_id", organization).in("id", partyIds),
  ) : [];
  const byId = new Map(parties.map((row) => [row.id, row]));
  return {
    status: "listed",
    contract: CONTRACT,
    now,
    through,
    count: profiles.length,
    relationships: profiles.map((profile) => ({
      party: byId.get(profile.party_id) || null,
      party_id: profile.party_id,
      relationship_label: profile.relationship_label,
      last_contact_at: profile.last_contact_at,
      next_follow_up_at: profile.next_follow_up_at,
      overdue: Date.parse(profile.next_follow_up_at) < Date.parse(now),
      next_touch: object(profile.metadata)?.[MEMORY_KEY]?.next_touch || null,
    })),
    relationship_priority_inferred: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  read: readSecretaryRelationshipMemory,
  recordFact: recordSecretaryRelationshipFact,
  correctFact: correctSecretaryRelationshipFact,
  retractFact: retractSecretaryRelationshipFact,
  recordInteraction: recordSecretaryRelationshipInteraction,
  setNextTouch: setSecretaryRelationshipNextTouch,
  clearNextTouch: clearSecretaryRelationshipNextTouch,
  listAttention: listSecretaryRelationshipAttention,
});
