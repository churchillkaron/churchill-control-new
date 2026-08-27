import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_WORKING_PREFERENCES_V1";
const REGISTER_KEY = "executive_working_preferences_v1";
const ALLOWED_DOMAINS = new Set(["CALENDAR", "MEETING", "COMMUNICATION", "TRAVEL", "ROUTINE", "GENERAL"]);
const SOURCE_KINDS = new Set(["USER_STATEMENT", "MESSAGE", "CALL", "MEETING", "DOCUMENT", "MANUAL"]);
const FORBIDDEN_KEY_PATTERN = /(?:password|passcode|secret|token|credential|api[_-]?key|private[_-]?key|pin|cvv|card[_-]?(?:number|details)|bank[_-]?(?:account|details)|cookie|session|approval[_-]?authority|binding[_-]?authority|signing[_-]?authority|payment[_-]?authority)/i;

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

function deterministicId(seed) {
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

function normalizedDomain(value) {
  const domain = text(value, 80).toUpperCase();
  if (!ALLOWED_DOMAINS.has(domain)) throw new Error("SECRETARY_WORKING_PREFERENCE_DOMAIN_INVALID");
  return domain;
}

function normalizedKey(value) {
  const key = text(value, 120).toLowerCase();
  if (!/^[a-z][a-z0-9_]{0,119}$/.test(key)) throw new Error("SECRETARY_WORKING_PREFERENCE_KEY_INVALID");
  if (FORBIDDEN_KEY_PATTERN.test(key)) throw new Error("SECRETARY_WORKING_PREFERENCE_SENSITIVE_KEY_FORBIDDEN");
  return key;
}

function preferencePath(domain, key) {
  return `${domain}.${key}`;
}

function validateTimezone(value) {
  const timezone = text(value, 120);
  if (!timezone) throw new Error("SECRETARY_WORKING_PREFERENCE_TIMEZONE_REQUIRED");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error("SECRETARY_WORKING_PREFERENCE_TIMEZONE_INVALID");
  }
  return timezone;
}

function jsonValue(value) {
  if (value === undefined) throw new Error("SECRETARY_WORKING_PREFERENCE_VALUE_REQUIRED");
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new Error("SECRETARY_WORKING_PREFERENCE_VALUE_INVALID");
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("SECRETARY_WORKING_PREFERENCE_VALUE_INVALID");
  }
  if (serialized === undefined || serialized.length > 12000) throw new Error("SECRETARY_WORKING_PREFERENCE_VALUE_INVALID");
  return JSON.parse(serialized);
}

function normalizedValue(domain, key, value) {
  if (domain === "CALENDAR" && key === "default_timezone") return validateTimezone(value);
  if (domain === "CALENDAR" && key === "default_language") {
    const language = text(value, 80);
    if (!language) throw new Error("SECRETARY_WORKING_PREFERENCE_LANGUAGE_REQUIRED");
    return language;
  }
  if (domain === "CALENDAR" && key === "appointment_duration_minutes") {
    const duration = Number(value);
    if (!Number.isInteger(duration) || duration < 5 || duration > 1440) {
      throw new Error("SECRETARY_WORKING_PREFERENCE_APPOINTMENT_DURATION_INVALID");
    }
    return duration;
  }
  if (domain === "CALENDAR" && key === "business_hours") {
    const hours = object(value);
    if (!Object.keys(hours).length) throw new Error("SECRETARY_WORKING_PREFERENCE_BUSINESS_HOURS_REQUIRED");
    return jsonValue(hours);
  }
  if ((domain === "MEETING" && ["buffer_before_minutes", "buffer_after_minutes", "default_duration_minutes"].includes(key))) {
    const minutes = Number(value);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
      throw new Error("SECRETARY_WORKING_PREFERENCE_MINUTES_INVALID");
    }
    if (key === "default_duration_minutes" && minutes < 5) throw new Error("SECRETARY_WORKING_PREFERENCE_MINUTES_INVALID");
    return minutes;
  }
  return jsonValue(value);
}

function provenance(payload = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_WORKING_PREFERENCE_EVIDENCE_REQUIRED");
  const sourceKind = text(payload.source_kind || payload.sourceKind || "USER_STATEMENT", 80).toUpperCase();
  if (!SOURCE_KINDS.has(sourceKind)) throw new Error("SECRETARY_WORKING_PREFERENCE_SOURCE_KIND_INVALID");
  return {
    evidence_id: evidenceId,
    source_kind: sourceKind,
    source_id: text(payload.source_id || payload.sourceId, 500) || null,
    evidence_excerpt: text(payload.evidence_excerpt || payload.evidenceExcerpt, 1500) || null,
  };
}

function emptyRegister(ownerPartyId) {
  return {
    contract: CONTRACT,
    version: 0,
    owner_party_id: ownerPartyId,
    current: {},
    history: [],
    preferences_inferred: false,
    secrets_stored: false,
    approval_authority_created: false,
    binding_authority_created: false,
    payment_authority_created: false,
    external_authority_used: false,
  };
}

function readRegister(settings, ownerPartyId) {
  const metadata = object(settings?.metadata);
  const raw = object(metadata[REGISTER_KEY]);
  if (raw.contract !== CONTRACT) return emptyRegister(ownerPartyId);
  return {
    ...emptyRegister(ownerPartyId),
    ...raw,
    owner_party_id: text(raw.owner_party_id, 120) || ownerPartyId,
    current: object(raw.current),
    history: list(raw.history),
  };
}

async function ensureSettingsRow({ organization, ownerPartyId, context }) {
  const existing = await one(
    supabaseAdmin.from("secretary_settings")
      .select("*")
      .eq("organization_id", organization)
      .maybeSingle(),
  );
  if (existing) return existing;
  const metadata = {
    owner_party_id: ownerPartyId,
    [REGISTER_KEY]: emptyRegister(ownerPartyId),
  };
  const inserted = await supabaseAdmin.from("secretary_settings").insert({
    organization_id: organization,
    default_timezone: text(context.timezone, 120) || "UTC",
    default_language: null,
    appointment_duration_minutes: 30,
    business_hours: {},
    call_handling_policy: {},
    message_handling_policy: {},
    booking_policy: { owner_party_id: ownerPartyId },
    memory_policy: {},
    metadata,
  }).select("*").single();
  if (!inserted.error) return inserted.data;
  if (inserted.error.code !== "23505") throw inserted.error;
  return one(
    supabaseAdmin.from("secretary_settings")
      .select("*")
      .eq("organization_id", organization)
      .single(),
  );
}

async function routingFor({ organization, actor, ownerPartyId, instruction }) {
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId,
    scope: "TASK_ROUTING",
    instruction,
    requiresOwnerAuthority: false,
    at: new Date().toISOString(),
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_WORKING_PREFERENCE_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || ownerPartyId;
  if (actor !== ownerPartyId && actor !== operational) throw new Error("SECRETARY_WORKING_PREFERENCE_ACTOR_NOT_AUTHORIZED");
  return { routing, operational };
}

function canonicalPatch(domain, key, value, { retract = false, context = {} } = {}) {
  if (domain !== "CALENDAR") return {};
  if (key === "default_timezone") return { default_timezone: retract ? text(context.timezone, 120) || "UTC" : value };
  if (key === "default_language") return { default_language: retract ? null : value };
  if (key === "appointment_duration_minutes") return { appointment_duration_minutes: retract ? 30 : value };
  if (key === "business_hours") return { business_hours: retract ? {} : value };
  return {};
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function mutateRegister({ context, instruction, producer }) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const resolvedOwner = await resolveSecretaryCanonicalOwner({ organizationId: organization });
  const ownerPartyId = text(resolvedOwner, 120) || actor;
  const { routing, operational } = await routingFor({ organization, actor, ownerPartyId, instruction });
  await ensureSettingsRow({ organization, ownerPartyId, context });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const settings = await one(
      supabaseAdmin.from("secretary_settings")
        .select("*")
        .eq("organization_id", organization)
        .single(),
    );
    const register = readRegister(settings, ownerPartyId);
    const produced = await producer({ settings, register, organization, actor, ownerPartyId, operational, routing });
    const nextRegister = {
      ...produced.register,
      contract: CONTRACT,
      owner_party_id: ownerPartyId,
      preferences_inferred: false,
      secrets_stored: false,
      approval_authority_created: false,
      binding_authority_created: false,
      payment_authority_created: false,
      external_authority_used: false,
    };
    const metadata = {
      ...object(settings.metadata),
      owner_party_id: text(object(settings.metadata).owner_party_id, 120) || ownerPartyId,
      [REGISTER_KEY]: nextRegister,
      secretary_working_preferences_contract: CONTRACT,
      secretary_working_preferences_version: nextRegister.version,
      ...secretaryAdministrativeCoverageMetadata(routing),
      preferences_inferred: false,
      secrets_stored: false,
      approval_authority_created: false,
      binding_authority_created: false,
      payment_authority_created: false,
      platform_permissions_mutated: false,
      external_authority_used: false,
    };
    const patch = {
      ...object(produced.settings_patch),
      metadata,
      updated_at: new Date().toISOString(),
    };
    const updated = await supabaseAdmin.from("secretary_settings")
      .update(patch)
      .eq("organization_id", organization)
      .eq("updated_at", settings.updated_at)
      .select("*")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (updated.data) return { settings: updated.data, register: nextRegister, output: object(produced.output), routing };
  }
  throw new Error("SECRETARY_WORKING_PREFERENCE_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

function newHistoryEntry({ event, domain, key, value, previousValue, provenanceData, actor, ownerPartyId, version, supersedesEntryId = null }) {
  const recordedAt = new Date().toISOString();
  const entryId = deterministicId(`${ownerPartyId}:${domain}:${key}:${event}:${version}:${provenanceData.evidence_id}`);
  return {
    entry_id: entryId,
    event,
    version,
    domain,
    key,
    path: preferencePath(domain, key),
    value,
    previous_value: previousValue,
    supersedes_entry_id: supersedesEntryId,
    evidence_id: provenanceData.evidence_id,
    source_kind: provenanceData.source_kind,
    source_id: provenanceData.source_id,
    evidence_excerpt: provenanceData.evidence_excerpt,
    recorded_at: recordedAt,
    recorded_by_party_id: actor,
    canonical_owner_party_id: ownerPartyId,
    preference_inferred: false,
    authority_created: false,
  };
}

export async function readSecretaryWorkingPreferences({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const ownerPartyId = text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actor;
  const settings = await ensureSettingsRow({ organization, ownerPartyId, context });
  const register = readRegister(settings, ownerPartyId);
  const includeHistory = payload.include_history === true || payload.includeHistory === true;
  const domainFilter = text(payload.domain, 80).toUpperCase();
  const current = Object.values(register.current)
    .filter((item) => !domainFilter || item.domain === domainFilter)
    .sort((a, b) => `${a.domain}.${a.key}`.localeCompare(`${b.domain}.${b.key}`));
  const history = includeHistory
    ? register.history.filter((item) => !domainFilter || item.domain === domainFilter)
    : [];
  return {
    status: "completed",
    contract: CONTRACT,
    owner_party_id: ownerPartyId,
    register_version: register.version,
    current_preferences: current,
    history,
    canonical_defaults: {
      default_timezone: settings.default_timezone,
      default_language: settings.default_language,
      appointment_duration_minutes: settings.appointment_duration_minutes,
      business_hours: settings.business_hours,
    },
    explicit_instruction_overrides_preference: true,
    preferences_inferred: false,
    secrets_stored: false,
    approval_authority_created: false,
    binding_authority_created: false,
    payment_authority_created: false,
    external_authority_used: false,
  };
}

export async function recordSecretaryWorkingPreference({ context, payload = {} } = {}) {
  const domain = normalizedDomain(payload.domain);
  const key = normalizedKey(payload.key);
  const value = normalizedValue(domain, key, payload.value);
  const provenanceData = provenance(payload);
  const path = preferencePath(domain, key);
  const result = await mutateRegister({
    context,
    instruction: `Record explicit executive working preference ${path}`,
    producer: async ({ register, actor, ownerPartyId }) => {
      const existing = object(register.current[path]);
      if (existing.entry_id) {
        if (sameValue(existing.value, value) && existing.evidence_id === provenanceData.evidence_id) {
          return { register, settings_patch: {}, output: { replay_safe: true, preference: existing } };
        }
        throw new Error("SECRETARY_WORKING_PREFERENCE_CORRECTION_REQUIRED");
      }
      const version = Number(register.version || 0) + 1;
      const entry = newHistoryEntry({
        event: "RECORDED",
        domain,
        key,
        value,
        previousValue: null,
        provenanceData,
        actor,
        ownerPartyId,
        version,
      });
      const current = {
        ...register.current,
        [path]: { ...entry, active: true },
      };
      return {
        register: { ...register, version, current, history: [...register.history, entry].slice(-1000) },
        settings_patch: canonicalPatch(domain, key, value, { context }),
        output: { replay_safe: false, preference: current[path] },
      };
    },
  });
  return {
    status: "recorded",
    contract: CONTRACT,
    preference: result.output.preference,
    register_version: result.register.version,
    replay_safe: result.output.replay_safe === true,
    explicit_instruction_overrides_preference: true,
    preference_inferred: false,
    external_authority_used: false,
  };
}

export async function correctSecretaryWorkingPreference({ context, payload = {} } = {}) {
  const domain = normalizedDomain(payload.domain);
  const key = normalizedKey(payload.key);
  const value = normalizedValue(domain, key, payload.value);
  const provenanceData = provenance(payload);
  const path = preferencePath(domain, key);
  const expectedEntryId = text(payload.supersedes_entry_id || payload.supersedesEntryId, 120) || null;
  const result = await mutateRegister({
    context,
    instruction: `Correct explicit executive working preference ${path}`,
    producer: async ({ register, actor, ownerPartyId }) => {
      const existing = object(register.current[path]);
      if (!existing.entry_id) throw new Error("SECRETARY_WORKING_PREFERENCE_NOT_FOUND");
      if (expectedEntryId && expectedEntryId !== existing.entry_id) throw new Error("SECRETARY_WORKING_PREFERENCE_STALE_CORRECTION_REJECTED");
      if (sameValue(existing.value, value) && existing.evidence_id === provenanceData.evidence_id) {
        return { register, settings_patch: {}, output: { replay_safe: true, preference: existing } };
      }
      const version = Number(register.version || 0) + 1;
      const entry = newHistoryEntry({
        event: "CORRECTED",
        domain,
        key,
        value,
        previousValue: existing.value,
        provenanceData,
        actor,
        ownerPartyId,
        version,
        supersedesEntryId: existing.entry_id,
      });
      const current = { ...register.current, [path]: { ...entry, active: true } };
      return {
        register: { ...register, version, current, history: [...register.history, entry].slice(-1000) },
        settings_patch: canonicalPatch(domain, key, value, { context }),
        output: { replay_safe: false, preference: current[path], superseded_entry_id: existing.entry_id },
      };
    },
  });
  return {
    status: "corrected",
    contract: CONTRACT,
    preference: result.output.preference,
    superseded_entry_id: result.output.superseded_entry_id || null,
    register_version: result.register.version,
    replay_safe: result.output.replay_safe === true,
    preference_inferred: false,
    external_authority_used: false,
  };
}

export async function retractSecretaryWorkingPreference({ context, payload = {} } = {}) {
  const domain = normalizedDomain(payload.domain);
  const key = normalizedKey(payload.key);
  const provenanceData = provenance(payload);
  const path = preferencePath(domain, key);
  const expectedEntryId = text(payload.supersedes_entry_id || payload.supersedesEntryId, 120) || null;
  const result = await mutateRegister({
    context,
    instruction: `Retract explicit executive working preference ${path}`,
    producer: async ({ register, actor, ownerPartyId }) => {
      const existing = object(register.current[path]);
      if (!existing.entry_id) throw new Error("SECRETARY_WORKING_PREFERENCE_NOT_FOUND");
      if (expectedEntryId && expectedEntryId !== existing.entry_id) throw new Error("SECRETARY_WORKING_PREFERENCE_STALE_RETRACTION_REJECTED");
      const version = Number(register.version || 0) + 1;
      const entry = newHistoryEntry({
        event: "RETRACTED",
        domain,
        key,
        value: null,
        previousValue: existing.value,
        provenanceData,
        actor,
        ownerPartyId,
        version,
        supersedesEntryId: existing.entry_id,
      });
      const current = { ...register.current };
      delete current[path];
      return {
        register: { ...register, version, current, history: [...register.history, entry].slice(-1000) },
        settings_patch: canonicalPatch(domain, key, null, { retract: true, context }),
        output: { retracted_entry_id: existing.entry_id, history_entry: entry },
      };
    },
  });
  return {
    status: "retracted",
    contract: CONTRACT,
    retracted_entry_id: result.output.retracted_entry_id,
    history_entry: result.output.history_entry,
    register_version: result.register.version,
    default_fallback_applied_for_canonical_setting: domain === "CALENDAR" && ["default_timezone", "default_language", "appointment_duration_minutes", "business_hours"].includes(key),
    preference_inferred: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  read: readSecretaryWorkingPreferences,
  record: recordSecretaryWorkingPreference,
  correct: correctSecretaryWorkingPreference,
  retract: retractSecretaryWorkingPreference,
});
