import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_IMPORTANT_DATE_STEWARDSHIP_V1";
const RELATIONSHIP_CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_RELATIONSHIP_MEMORY_V1";
const REGISTER_KEY = "important_date_stewardship_v1";
const RELATIONSHIP_KEY = "relationship_memory_v1";
const KINDS = new Set(["BIRTHDAY", "ANNIVERSARY", "RELATIONSHIP_MILESTONE", "PERSONAL_MILESTONE", "OTHER"]);
const RECURRENCES = new Set(["ANNUAL", "NONE"]);
const LEAP_POLICIES = new Set(["FEB_28", "MAR_01", "SKIP"]);

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
  const value = text(context.organizationId, 120);
  if (!value) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return value;
}

function actorPartyId(context = {}) {
  const value = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!value) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return value;
}

function iso(value, field, required = true) {
  const raw = text(value, 180);
  if (!raw) {
    if (required) throw new Error(`SECRETARY_IMPORTANT_DATE_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_IMPORTANT_DATE_${field.toUpperCase()}_INVALID`);
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

function payloadHash(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function safetyFlags() {
  return {
    date_inferred: false,
    age_inferred: false,
    relationship_importance_inferred: false,
    reminder_is_internal_only: true,
    external_message_sent: false,
    gift_purchased: false,
    reservation_created: false,
    calendar_event_created: false,
    calendar_event_modified: false,
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
  const kind = text(value || "OTHER", 80).toUpperCase();
  if (!KINDS.has(kind)) throw new Error("SECRETARY_IMPORTANT_DATE_KIND_INVALID");
  return kind;
}

function normalizeRecurrence(value) {
  const recurrence = text(value || "ANNUAL", 40).toUpperCase();
  if (!RECURRENCES.has(recurrence)) throw new Error("SECRETARY_IMPORTANT_DATE_RECURRENCE_INVALID");
  return recurrence;
}

function normalizeTimezone(value) {
  const timezone = text(value || "UTC", 120);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error("SECRETARY_IMPORTANT_DATE_TIMEZONE_INVALID");
  }
  return timezone;
}

function normalizeMonthDay(value) {
  const clean = text(value, 5);
  if (!/^\d{2}-\d{2}$/.test(clean)) throw new Error("SECRETARY_IMPORTANT_DATE_MONTH_DAY_INVALID");
  const [month, day] = clean.split("-").map(Number);
  const probe = new Date(Date.UTC(2024, month - 1, day));
  if (probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) throw new Error("SECRETARY_IMPORTANT_DATE_MONTH_DAY_INVALID");
  return clean;
}

function normalizeLocalDate(value) {
  const clean = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) throw new Error("SECRETARY_IMPORTANT_DATE_OCCURS_ON_INVALID");
  const [year, month, day] = clean.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) {
    throw new Error("SECRETARY_IMPORTANT_DATE_OCCURS_ON_INVALID");
  }
  return clean;
}

function normalizeReminderDays(value) {
  const input = value === undefined ? [7, 1, 0] : list(value);
  const normalized = input.map(Number);
  if (!normalized.length || normalized.some((day) => !Number.isInteger(day) || day < 0 || day > 3650)) {
    throw new Error("SECRETARY_IMPORTANT_DATE_REMINDER_DAYS_INVALID");
  }
  return [...new Set(normalized)].sort((a, b) => b - a).slice(0, 20);
}

function normalizeReminderTime(value) {
  const clean = text(value || "09:00", 5);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clean)) throw new Error("SECRETARY_IMPORTANT_DATE_REMINDER_TIME_INVALID");
  return clean;
}

function normalizeDateSpec(payload = {}, current = null) {
  const recurrence = normalizeRecurrence(payload.recurrence ?? current?.recurrence ?? "ANNUAL");
  let monthDay = null;
  let occursOn = null;
  let leapDayPolicy = null;
  if (recurrence === "ANNUAL") {
    monthDay = normalizeMonthDay(payload.month_day ?? payload.monthDay ?? current?.month_day);
    if (monthDay === "02-29") {
      leapDayPolicy = text(payload.leap_day_policy ?? payload.leapDayPolicy ?? current?.leap_day_policy, 20).toUpperCase();
      if (!LEAP_POLICIES.has(leapDayPolicy)) throw new Error("SECRETARY_IMPORTANT_DATE_LEAP_DAY_POLICY_REQUIRED");
    }
  } else {
    occursOn = normalizeLocalDate(payload.occurs_on ?? payload.occursOn ?? current?.occurs_on);
  }
  return {
    recurrence,
    month_day: monthDay,
    occurs_on: occursOn,
    leap_day_policy: leapDayPolicy,
    timezone: normalizeTimezone(payload.timezone ?? current?.timezone ?? "UTC"),
    reminder_days_before: normalizeReminderDays(payload.reminder_days_before ?? payload.reminderDaysBefore ?? current?.reminder_days_before),
    reminder_local_time: normalizeReminderTime(payload.reminder_local_time ?? payload.reminderLocalTime ?? current?.reminder_local_time),
  };
}

function localParts(instant, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function localDateKey(parts) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function zonedLocalToIso({ date, time, timezone }) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = targetUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = localParts(guess, timezone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const delta = represented - targetUtc;
    if (delta === 0) break;
    guess -= delta;
  }
  const verified = localParts(guess, timezone);
  if (localDateKey(verified) !== date || verified.hour !== hour || verified.minute !== minute) {
    throw new Error("SECRETARY_IMPORTANT_DATE_LOCAL_TIME_UNRESOLVABLE");
  }
  return new Date(guess).toISOString();
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function annualDateForYear(record, year) {
  if (record.month_day !== "02-29" || isLeapYear(year)) return `${year}-${record.month_day}`;
  if (record.leap_day_policy === "FEB_28") return `${year}-02-28`;
  if (record.leap_day_policy === "MAR_01") return `${year}-03-01`;
  return null;
}

function nextOccurrenceDate(record, nowIso) {
  const today = localDateKey(localParts(nowIso, record.timezone));
  if (record.recurrence === "NONE") return record.occurs_on >= today ? record.occurs_on : null;
  const startYear = Number(today.slice(0, 4));
  for (let year = startYear; year <= startYear + 8; year += 1) {
    const candidate = annualDateForYear(record, year);
    if (candidate && candidate >= today) return candidate;
  }
  return null;
}

function dateMinusDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day - days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function daysBetween(left, right) {
  const [ly, lm, ld] = left.split("-").map(Number);
  const [ry, rm, rd] = right.split("-").map(Number);
  return Math.round((Date.UTC(ry, rm - 1, rd) - Date.UTC(ly, lm - 1, ld)) / 86400000);
}

async function ensureParty(organization, partyId) {
  const id = text(partyId, 120);
  if (!id) throw new Error("SECRETARY_IMPORTANT_DATE_PARTY_REQUIRED");
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id,display_name,legal_name,status")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!party) throw new Error("SECRETARY_IMPORTANT_DATE_PARTY_NOT_FOUND");
  return party;
}

async function routingFor({ context, instruction, at }) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const owner = text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actor;
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId: owner,
    scope: "FOLLOW_UP_COORDINATION",
    instruction,
    at,
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_IMPORTANT_DATE_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_IMPORTANT_DATE_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

function normalizeRelationshipMemory(metadata = {}) {
  const current = object(object(metadata)[RELATIONSHIP_KEY]);
  return {
    contract: RELATIONSHIP_CONTRACT,
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

function normalizeRegister(metadata = {}) {
  const current = object(object(metadata)[REGISTER_KEY]);
  return {
    contract: CONTRACT,
    dates: list(current.dates),
    history: list(current.history),
    relationship_memory_is_source_of_truth: true,
    date_inferred: false,
    age_inferred: false,
    ...safetyFlags(),
  };
}

async function ensureProfile(organization, partyId) {
  let profile = await one(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("*")
      .eq("organization_id", organization)
      .eq("party_id", partyId)
      .maybeSingle(),
  );
  if (profile) return profile;
  const inserted = await supabaseAdmin.from("secretary_contact_profiles").insert({
    organization_id: organization,
    party_id: partyId,
    metadata: {
      [RELATIONSHIP_KEY]: normalizeRelationshipMemory({}),
      [REGISTER_KEY]: normalizeRegister({}),
    },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code !== "23505") throw inserted.error;
    return one(
      supabaseAdmin.from("secretary_contact_profiles")
        .select("*")
        .eq("organization_id", organization)
        .eq("party_id", partyId)
        .single(),
    );
  }
  return inserted.data;
}

async function mutateProfile({ organization, partyId, producer }) {
  await ensureProfile(organization, partyId);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const profile = await one(
      supabaseAdmin.from("secretary_contact_profiles")
        .select("*")
        .eq("organization_id", organization)
        .eq("party_id", partyId)
        .single(),
    );
    const produced = await producer({
      profile,
      register: normalizeRegister(profile.metadata),
      relationship: normalizeRelationshipMemory(profile.metadata),
    });
    const metadata = {
      ...object(profile.metadata),
      [REGISTER_KEY]: produced.register,
      [RELATIONSHIP_KEY]: produced.relationship,
    };
    const updated = await supabaseAdmin.from("secretary_contact_profiles")
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq("organization_id", organization)
      .eq("party_id", partyId)
      .eq("updated_at", profile.updated_at)
      .select("*")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (updated.data) return { profile: updated.data, output: object(produced.output) };
  }
  throw new Error("SECRETARY_IMPORTANT_DATE_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

function relationshipFactKey(record) {
  const slug = record.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "date";
  return `important_date:${record.kind.toLowerCase()}:${slug}`;
}

function relationshipFactValue(record) {
  return {
    kind: record.kind,
    label: record.label,
    recurrence: record.recurrence,
    month_day: record.month_day,
    occurs_on: record.occurs_on,
    leap_day_policy: record.leap_day_policy,
    timezone: record.timezone,
  };
}

function newRelationshipFact({ organization, partyId, record, evidenceId, sourceReference, observedAt, actor }) {
  const key = relationshipFactKey(record);
  const value = relationshipFactValue(record);
  const id = deterministicUuid(`secretary-relationship-fact-v1:${organization}:${partyId}:${evidenceId}:${key}:${stableJson(value)}`);
  return {
    id,
    key,
    value,
    category: "IMPORTANT_DATE",
    status: "CURRENT",
    evidence_id: evidenceId,
    source_reference: sourceReference,
    observed_at: observedAt,
    valid_until: null,
    recorded_at: observedAt,
    recorded_by_party_id: actor,
    notes: record.note,
    inferred: false,
  };
}

function reminderId({ organization, partyId, dateId, occurrenceDate, leadDays }) {
  return deterministicUuid(`avantiqo-secretary-important-date-reminder-v1:${organization}:${partyId}:${dateId}:${occurrenceDate}:${leadDays}`);
}

async function ensureReminder({ organization, party, ownerPartyId, entityId, record, occurrenceDate, leadDays, dueAt, actor }) {
  const id = reminderId({ organization, partyId: party.id, dateId: record.id, occurrenceDate, leadDays });
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return { follow_up: existing, created: false };
  const reason = [
    `Internal important-date reminder: ${record.label} for ${party.display_name || party.legal_name || "contact"} is ${occurrenceDate}.`,
    leadDays === 0 ? "The date is today." : `This is the ${leadDays}-day advance reminder.`,
    record.note ? `Recorded note: ${record.note}.` : null,
    "Review and decide any appropriate action. Do not infer age, relationship importance, consent, gift preference, message content, or authority to contact or purchase anything.",
  ].filter(Boolean).join(" ");
  const followUp = await one(
    supabaseAdmin.from("secretary_follow_ups").insert({
      id,
      organization_id: organization,
      entity_id: entityId || null,
      owner_party_id: ownerPartyId,
      contact_party_id: party.id,
      action_type: "REVIEW",
      reason,
      status: "PENDING",
      due_at: dueAt,
      created_by_party_id: actor,
      metadata: {
        execution_owner: "SECRETARY",
        execution_ready: false,
        secretary_owned: true,
        secretary_important_date_stewardship: true,
        secretary_important_date_contract: CONTRACT,
        important_date_id: record.id,
        important_date_occurrence: occurrenceDate,
        important_date_lead_days: leadDays,
        relationship_fact_id: record.relationship_fact_id,
        ...safetyFlags(),
      },
    }).select("*").single(),
  );
  return { follow_up: followUp, created: true };
}

async function cancelPendingDateReminders({ organization, partyId, dateId, reason }) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", organization)
      .eq("contact_party_id", partyId)
      .eq("status", "PENDING")
      .limit(500),
  );
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    return metadata.secretary_important_date_contract === CONTRACT && metadata.important_date_id === dateId;
  }).map((row) => row.id);
  if (!ids.length) return [];
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "CANCELLED", completed_at: now, result: text(reason, 1200), updated_at: now })
    .eq("organization_id", organization)
    .in("id", ids);
  if (result.error) throw result.error;
  return ids;
}

function dateRecordView(record, nowIso) {
  const nextDate = record.status === "ACTIVE" ? nextOccurrenceDate(record, nowIso) : null;
  return {
    ...record,
    next_occurrence_date: nextDate,
    next_occurrence_at: nextDate ? zonedLocalToIso({ date: nextDate, time: record.reminder_local_time, timezone: record.timezone }) : null,
  };
}

export async function registerSecretaryImportantDate({ context, payload = {} } = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_IMPORTANT_DATE_EVIDENCE_REQUIRED");
  const recordedAt = iso(payload.recorded_at || payload.recordedAt || payload.observed_at || payload.observedAt, "recorded_at");
  const auth = await routingFor({ context, instruction: "Record and steward an explicit important relationship date.", at: recordedAt });
  const party = await ensureParty(auth.organization, payload.party_id || payload.partyId);
  const kind = normalizeKind(payload.kind);
  const label = text(payload.label, 500);
  if (!label) throw new Error("SECRETARY_IMPORTANT_DATE_LABEL_REQUIRED");
  const spec = normalizeDateSpec(payload);
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1600) || null;
  const note = text(payload.note || payload.notes, 1600) || null;
  const normalized = {
    party_id: party.id,
    kind,
    label,
    ...spec,
    note,
    source_reference: sourceReference,
    evidence_id: evidenceId,
    recorded_at: recordedAt,
  };
  const hash = payloadHash(normalized);
  const dateId = deterministicUuid(`avantiqo-secretary-important-date-v1:${auth.organization}:${party.id}:${evidenceId}:${hash}`);

  const changed = await mutateProfile({
    organization: auth.organization,
    partyId: party.id,
    producer: async ({ register, relationship }) => {
      for (const entry of register.history) {
        if (entry.evidence_id !== evidenceId) continue;
        if (entry.event === "IMPORTANT_DATE_REGISTERED" && entry.payload_sha256 === hash) {
          const existing = register.dates.find((date) => date.id === entry.date_id);
          return { register, relationship, output: { record: existing, replaySafe: true } };
        }
        throw new Error("SECRETARY_IMPORTANT_DATE_EVIDENCE_REUSE_CONFLICT");
      }
      const skeleton = {
        id: dateId,
        kind,
        label,
        ...spec,
        note,
        source_reference: sourceReference,
      };
      const fact = newRelationshipFact({
        organization: auth.organization,
        partyId: party.id,
        record: skeleton,
        evidenceId,
        sourceReference,
        observedAt: recordedAt,
        actor: auth.actor,
      });
      const facts = relationship.facts.map((row) => row.status === "CURRENT" && row.key === fact.key
        ? { ...row, status: "SUPERSEDED", superseded_at: recordedAt, superseded_by_fact_id: fact.id }
        : row);
      facts.push(fact);
      const record = {
        ...skeleton,
        status: "ACTIVE",
        version: 1,
        relationship_fact_id: fact.id,
        recorded_at: recordedAt,
        recorded_by_party_id: auth.actor,
        retired_at: null,
        retirement_reason: null,
        history: [{
          event: "IMPORTANT_DATE_REGISTERED",
          evidence_id: evidenceId,
          occurred_at: recordedAt,
          recorded_by_party_id: auth.actor,
          version: 1,
          payload_sha256: hash,
        }],
        ...safetyFlags(),
      };
      return {
        register: {
          ...register,
          dates: [...register.dates, record].slice(-250),
          history: [...register.history, { event: "IMPORTANT_DATE_REGISTERED", evidence_id: evidenceId, occurred_at: recordedAt, date_id: dateId, payload_sha256: hash }].slice(-500),
          ...safetyFlags(),
        },
        relationship: { ...relationship, facts: facts.slice(-250), facts_not_inferred: true, external_authority_used: false },
        output: { record, replaySafe: false },
      };
    },
  });

  return {
    status: "recorded",
    contract: CONTRACT,
    party,
    profile: changed.profile,
    record: dateRecordView(changed.output.record, recordedAt),
    replay_safe: changed.output.replaySafe,
    relationship_memory_is_source_of_truth: true,
    ...secretaryAdministrativeCoverageMetadata(auth.routing),
    ...safetyFlags(),
  };
}

async function mutateImportantDate({ context, payload, eventName, instruction, producer }) {
  const organization = organizationId(context);
  const party = await ensureParty(organization, payload.party_id || payload.partyId);
  const dateId = text(payload.date_id || payload.dateId, 120);
  if (!dateId) throw new Error("SECRETARY_IMPORTANT_DATE_ID_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_IMPORTANT_DATE_EXPECTED_VERSION_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_IMPORTANT_DATE_EVIDENCE_REQUIRED");
  const occurredAt = iso(payload.occurred_at || payload.occurredAt, "occurred_at");
  const hash = payloadHash(payload);
  const auth = await routingFor({ context, instruction, at: occurredAt });

  const changed = await mutateProfile({
    organization,
    partyId: party.id,
    producer: async ({ register, relationship }) => {
      const index = register.dates.findIndex((date) => date.id === dateId);
      if (index < 0) throw new Error("SECRETARY_IMPORTANT_DATE_NOT_FOUND");
      const current = register.dates[index];
      const replay = list(current.history).find((entry) => entry.evidence_id === evidenceId);
      if (replay) {
        if (replay.event === eventName && replay.payload_sha256 === hash) return { register, relationship, output: { record: current, replaySafe: true } };
        throw new Error("SECRETARY_IMPORTANT_DATE_EVIDENCE_REUSE_CONFLICT");
      }
      if (current.status !== "ACTIVE") throw new Error(`SECRETARY_IMPORTANT_DATE_STATE_INVALID:${current.status}`);
      if (Number(current.version) !== expectedVersion) throw new Error("SECRETARY_IMPORTANT_DATE_STALE_VERSION");
      return producer({ register, relationship, current, index, party, auth, evidenceId, occurredAt, hash, expectedVersion });
    },
  });

  return {
    status: "completed",
    contract: CONTRACT,
    party,
    profile: changed.profile,
    record: dateRecordView(changed.output.record, occurredAt),
    replay_safe: changed.output.replaySafe,
    relationship_memory_is_source_of_truth: true,
    ...secretaryAdministrativeCoverageMetadata(auth.routing),
    ...safetyFlags(),
  };
}

export async function reviseSecretaryImportantDate({ context, payload = {} } = {}) {
  const result = await mutateImportantDate({
    context,
    payload,
    eventName: "IMPORTANT_DATE_REVISED",
    instruction: "Revise an evidence-backed important relationship date without inferring missing date facts.",
    producer: async ({ register, relationship, current, index, auth, evidenceId, occurredAt, hash, expectedVersion }) => {
      const spec = normalizeDateSpec(payload, current);
      const note = payload.note !== undefined || payload.notes !== undefined ? text(payload.note ?? payload.notes, 1600) || null : current.note;
      const sourceReference = payload.source_reference !== undefined || payload.sourceReference !== undefined
        ? text(payload.source_reference ?? payload.sourceReference, 1600) || null
        : current.source_reference;
      const reason = text(payload.reason, 1600);
      if (!reason) throw new Error("SECRETARY_IMPORTANT_DATE_REVISION_REASON_REQUIRED");
      const nextVersion = expectedVersion + 1;
      const replacementBase = { ...current, ...spec, note, source_reference: sourceReference };
      const replacementFact = newRelationshipFact({
        organization: auth.organization,
        partyId: current.party_id || payload.party_id || payload.partyId,
        record: replacementBase,
        evidenceId,
        sourceReference,
        observedAt: occurredAt,
        actor: auth.actor,
      });
      replacementFact.key = relationship.facts.find((row) => row.id === current.relationship_fact_id)?.key || relationshipFactKey(current);
      const facts = relationship.facts.map((fact) => {
        if (fact.id === current.relationship_fact_id) return { ...fact, status: "CORRECTED", corrected_at: occurredAt, corrected_by_fact_id: replacementFact.id };
        if (fact.status === "CURRENT" && fact.key === replacementFact.key) return { ...fact, status: "SUPERSEDED", superseded_at: occurredAt, superseded_by_fact_id: replacementFact.id };
        return fact;
      });
      facts.push(replacementFact);
      const correction = {
        evidence_id: evidenceId,
        reason,
        target_fact_id: current.relationship_fact_id,
        replacement_fact_id: replacementFact.id,
        corrected_at: occurredAt,
        corrected_by_party_id: auth.actor,
      };
      const record = {
        ...current,
        ...spec,
        note,
        source_reference: sourceReference,
        version: nextVersion,
        relationship_fact_id: replacementFact.id,
        history: [...list(current.history), {
          event: "IMPORTANT_DATE_REVISED",
          evidence_id: evidenceId,
          occurred_at: occurredAt,
          recorded_by_party_id: auth.actor,
          version: nextVersion,
          payload_sha256: hash,
          reason,
        }].slice(-100),
        ...safetyFlags(),
      };
      const dates = [...register.dates];
      dates[index] = record;
      return {
        register: {
          ...register,
          dates,
          history: [...register.history, { event: "IMPORTANT_DATE_REVISED", evidence_id: evidenceId, occurred_at: occurredAt, date_id: current.id, payload_sha256: hash }].slice(-500),
          ...safetyFlags(),
        },
        relationship: {
          ...relationship,
          facts: facts.slice(-250),
          corrections: [...relationship.corrections, correction].slice(-100),
          facts_not_inferred: true,
          external_authority_used: false,
        },
        output: { record, replaySafe: false },
      };
    },
  });
  await cancelPendingDateReminders({
    organization: organizationId(context),
    partyId: payload.party_id || payload.partyId,
    dateId: payload.date_id || payload.dateId,
    reason: "Important date was explicitly revised; old reminders were superseded.",
  });
  return result;
}

export async function retireSecretaryImportantDate({ context, payload = {} } = {}) {
  const reason = text(payload.reason, 1600);
  if (!reason) throw new Error("SECRETARY_IMPORTANT_DATE_RETIRE_REASON_REQUIRED");
  const result = await mutateImportantDate({
    context,
    payload,
    eventName: "IMPORTANT_DATE_RETIRED",
    instruction: "Retire an important relationship date from active stewardship while preserving historical evidence.",
    producer: async ({ register, relationship, current, index, auth, evidenceId, occurredAt, hash, expectedVersion }) => {
      const nextVersion = expectedVersion + 1;
      const facts = relationship.facts.map((fact) => fact.id === current.relationship_fact_id ? {
        ...fact,
        status: "RETRACTED",
        retraction_evidence_id: evidenceId,
        retraction_reason: reason,
        retracted_at: occurredAt,
        retracted_by_party_id: auth.actor,
      } : fact);
      const record = {
        ...current,
        status: "RETIRED",
        version: nextVersion,
        retired_at: occurredAt,
        retirement_reason: reason,
        history: [...list(current.history), {
          event: "IMPORTANT_DATE_RETIRED",
          evidence_id: evidenceId,
          occurred_at: occurredAt,
          recorded_by_party_id: auth.actor,
          version: nextVersion,
          payload_sha256: hash,
          reason,
        }].slice(-100),
        ...safetyFlags(),
      };
      const dates = [...register.dates];
      dates[index] = record;
      return {
        register: {
          ...register,
          dates,
          history: [...register.history, { event: "IMPORTANT_DATE_RETIRED", evidence_id: evidenceId, occurred_at: occurredAt, date_id: current.id, payload_sha256: hash }].slice(-500),
          ...safetyFlags(),
        },
        relationship: { ...relationship, facts, facts_not_inferred: true, external_authority_used: false },
        output: { record, replaySafe: false },
      };
    },
  });
  await cancelPendingDateReminders({
    organization: organizationId(context),
    partyId: payload.party_id || payload.partyId,
    dateId: payload.date_id || payload.dateId,
    reason,
  });
  return result;
}

export async function refreshSecretaryImportantDateReminders({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const now = iso(payload.now || new Date().toISOString(), "now");
  const horizonDays = Math.max(1, Math.min(Number(payload.horizon_days ?? payload.horizonDays) || 90, 730));
  const partyFilter = text(payload.party_id || payload.partyId, 120) || null;
  const auth = await routingFor({ context, instruction: "Materialize internal reminders for evidence-backed important relationship dates.", at: now });
  let query = supabaseAdmin.from("secretary_contact_profiles")
    .select("organization_id,party_id,metadata")
    .eq("organization_id", organization)
    .limit(1000);
  if (partyFilter) query = query.eq("party_id", partyFilter);
  const profiles = await many(query);
  const partyIds = [...new Set(profiles.map((profile) => profile.party_id).filter(Boolean))];
  const parties = partyIds.length ? await many(
    supabaseAdmin.from("parties")
      .select("id,display_name,legal_name")
      .eq("organization_id", organization)
      .in("id", partyIds),
  ) : [];
  const partyMap = new Map(parties.map((party) => [party.id, party]));
  let created = 0;
  let existing = 0;
  const materialized = [];

  for (const profile of profiles) {
    const register = normalizeRegister(profile.metadata);
    const party = partyMap.get(profile.party_id);
    if (!party) continue;
    for (const record of register.dates.filter((date) => date.status === "ACTIVE")) {
      const occurrenceDate = nextOccurrenceDate(record, now);
      if (!occurrenceDate) continue;
      const today = localDateKey(localParts(now, record.timezone));
      const until = daysBetween(today, occurrenceDate);
      if (until > horizonDays) continue;
      for (const leadDays of record.reminder_days_before) {
        const reminderDate = dateMinusDays(occurrenceDate, leadDays);
        const dueAt = zonedLocalToIso({ date: reminderDate, time: record.reminder_local_time, timezone: record.timezone });
        const outcome = await ensureReminder({
          organization,
          party,
          ownerPartyId: auth.operational,
          entityId: context.entityId || null,
          record,
          occurrenceDate,
          leadDays,
          dueAt,
          actor: auth.actor,
        });
        if (outcome.created) created += 1;
        else existing += 1;
        materialized.push({ date_id: record.id, party_id: party.id, occurrence_date: occurrenceDate, lead_days: leadDays, due_at: dueAt, follow_up_id: outcome.follow_up.id, created: outcome.created });
      }
    }
  }

  return {
    status: "completed",
    contract: CONTRACT,
    now,
    horizon_days: horizonDays,
    reminders_created: created,
    reminders_existing: existing,
    materialized,
    relationship_memory_is_source_of_truth: true,
    ...secretaryAdministrativeCoverageMetadata(auth.routing),
    ...safetyFlags(),
  };
}

export async function readSecretaryImportantDates({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const party = await ensureParty(organization, payload.party_id || payload.partyId);
  const now = iso(payload.now || new Date().toISOString(), "now");
  const profile = await ensureProfile(organization, party.id);
  const register = normalizeRegister(profile.metadata);
  return {
    status: "completed",
    contract: CONTRACT,
    party,
    dates: register.dates.map((record) => dateRecordView(record, now)),
    relationship_memory_is_source_of_truth: true,
    ...safetyFlags(),
  };
}

export async function listSecretaryUpcomingImportantDates({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const now = iso(payload.now || new Date().toISOString(), "now");
  const throughDays = Math.max(0, Math.min(Number(payload.through_days ?? payload.throughDays) || 90, 730));
  const limit = Math.max(1, Math.min(Number(payload.limit) || 100, 500));
  const profiles = await many(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("party_id,metadata")
      .eq("organization_id", organization)
      .limit(2000),
  );
  const partyIds = [...new Set(profiles.map((profile) => profile.party_id).filter(Boolean))];
  const parties = partyIds.length ? await many(
    supabaseAdmin.from("parties")
      .select("id,display_name,legal_name,status")
      .eq("organization_id", organization)
      .in("id", partyIds),
  ) : [];
  const partyMap = new Map(parties.map((party) => [party.id, party]));
  const rows = [];
  for (const profile of profiles) {
    const party = partyMap.get(profile.party_id);
    if (!party) continue;
    for (const record of normalizeRegister(profile.metadata).dates.filter((date) => date.status === "ACTIVE")) {
      const occurrenceDate = nextOccurrenceDate(record, now);
      if (!occurrenceDate) continue;
      const today = localDateKey(localParts(now, record.timezone));
      const daysUntil = daysBetween(today, occurrenceDate);
      if (daysUntil < 0 || daysUntil > throughDays) continue;
      rows.push({
        party,
        record: dateRecordView(record, now),
        days_until: daysUntil,
      });
    }
  }
  rows.sort((a, b) => a.days_until - b.days_until || a.record.label.localeCompare(b.record.label));
  return {
    status: "completed",
    contract: CONTRACT,
    now,
    through_days: throughDays,
    upcoming: rows.slice(0, limit),
    count: Math.min(rows.length, limit),
    relationship_memory_is_source_of_truth: true,
    ...safetyFlags(),
  };
}

export default Object.freeze({
  register: registerSecretaryImportantDate,
  revise: reviseSecretaryImportantDate,
  retire: retireSecretaryImportantDate,
  refresh: refreshSecretaryImportantDateReminders,
  read: readSecretaryImportantDates,
  listUpcoming: listSecretaryUpcomingImportantDates,
});
