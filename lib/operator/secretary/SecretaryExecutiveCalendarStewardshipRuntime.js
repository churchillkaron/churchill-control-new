import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { bookSecretaryCalendarEventAtomic } from "@/lib/operator/secretary/SecretaryAtomicBookingRuntime";
import { readSecretaryWorkingPreferences } from "@/lib/operator/secretary/SecretaryWorkingPreferencesRuntime";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_CALENDAR_STEWARDSHIP_V1";
const SOURCE = "secretary_calendar_stewardship";
const PROTECTION_KINDS = new Set(["FOCUS", "PREP", "BUFFER", "PERSONAL", "TRAVEL"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
    if (required) throw new Error(`SECRETARY_CALENDAR_STEWARDSHIP_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_CALENDAR_STEWARDSHIP_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function boundedMinutes(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 1440) {
    throw new Error(`SECRETARY_CALENDAR_STEWARDSHIP_${field.toUpperCase()}_INVALID`);
  }
  return number;
}

function safetyFlags() {
  return {
    preferences_inferred: false,
    calendar_priority_inferred: false,
    meeting_importance_inferred: false,
    location_travel_time_inferred: false,
    meeting_moved: false,
    external_event_cancelled: false,
    attendance_inferred: false,
    payment_authority_created: false,
    booking_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
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

async function ownerFor(context) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  return text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actor;
}

async function calendarRouting({ context, instruction, at = new Date().toISOString() }) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const owner = await ownerFor(context);
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId: owner,
    scope: "CALENDAR_COORDINATION",
    instruction,
    at,
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_CALENDAR_STEWARDSHIP_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_CALENDAR_STEWARDSHIP_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

function preferenceMap(read = {}) {
  return new Map((Array.isArray(read.current_preferences) ? read.current_preferences : [])
    .map((item) => [text(item.path, 240), item.value]));
}

function rule({ payload, payloadKey, preferences, preferencePath }) {
  const direct = payload[payloadKey] ?? payload[payloadKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
  if (direct !== undefined) {
    return { minutes: boundedMinutes(direct, payloadKey), source: "EXPLICIT_PAYLOAD" };
  }
  if (preferences.has(preferencePath)) {
    return { minutes: boundedMinutes(preferences.get(preferencePath), payloadKey), source: "WORKING_PREFERENCE" };
  }
  return { minutes: 0, source: "UNSET_ZERO" };
}

async function stewardshipRules({ context, payload }) {
  const read = await readSecretaryWorkingPreferences({ context, payload: { domain: "MEETING" } });
  const preferences = preferenceMap(read);
  return {
    before: rule({ payload, payloadKey: "buffer_before_minutes", preferences, preferencePath: "MEETING.buffer_before_minutes" }),
    after: rule({ payload, payloadKey: "buffer_after_minutes", preferences, preferencePath: "MEETING.buffer_after_minutes" }),
    location: rule({ payload, payloadKey: "location_change_buffer_minutes", preferences, preferencePath: "MEETING.location_change_buffer_minutes" }),
    preference_register_version: read.register_version,
    explicit_instruction_overrides_preference: true,
    preferences_inferred: false,
  };
}

function sameLocation(left, right) {
  const a = text(left, 1000).toLowerCase();
  const b = text(right, 1000).toLowerCase();
  if (!a || !b) return true;
  return a === b;
}

function transitionRisk(previous, next, rules) {
  const previousEnd = Date.parse(previous.ends_at);
  const nextStart = Date.parse(next.starts_at);
  const gapMinutes = Math.floor((nextStart - previousEnd) / 60000);
  const overlapMinutes = gapMinutes < 0 ? Math.abs(gapMinutes) : 0;
  const baseRequired = rules.after.minutes + rules.before.minutes;
  const locationChanged = !sameLocation(previous.location, next.location);
  const locationRequired = locationChanged ? rules.location.minutes : 0;
  const requiredMinutes = Math.max(baseRequired, locationRequired);
  const reasons = [];
  if (gapMinutes < 0) reasons.push("OVERLAP");
  if (gapMinutes >= 0 && gapMinutes < baseRequired) reasons.push("BUFFER_SHORTFALL");
  if (gapMinutes >= 0 && locationChanged && gapMinutes < locationRequired) reasons.push("LOCATION_CHANGE_BUFFER_SHORTFALL");
  if (!reasons.length) return null;
  return {
    previous_event_id: previous.id,
    previous_title: previous.title,
    previous_ends_at: previous.ends_at,
    previous_location: previous.location || null,
    next_event_id: next.id,
    next_title: next.title,
    next_starts_at: next.starts_at,
    next_location: next.location || null,
    gap_minutes: gapMinutes,
    overlap_minutes: overlapMinutes,
    required_buffer_minutes: requiredMinutes,
    base_buffer_minutes: baseRequired,
    explicit_location_change_buffer_minutes: locationRequired,
    location_changed: locationChanged,
    reasons,
    temporal_only: true,
    importance_inferred: false,
    travel_time_inferred: false,
  };
}

function protectionMetadata(event) {
  const metadata = object(event?.metadata);
  return metadata.secretary_calendar_stewardship === true && metadata.secretary_calendar_stewardship_contract === CONTRACT
    ? metadata
    : null;
}

function protectionKey({ organization, owner, kind, startsAt, endsAt, evidenceId }) {
  return createHash("sha256")
    .update(`${organization}|${owner}|${kind}|${startsAt}|${endsAt}|${evidenceId}`)
    .digest("hex");
}

async function findProtectionByKey({ organization, owner, key }) {
  const rows = await many(
    supabaseAdmin.from("secretary_calendar_events")
      .select("*")
      .eq("organization_id", organization)
      .eq("owner_party_id", owner)
      .eq("source", SOURCE)
      .limit(300),
  );
  return rows.find((row) => protectionMetadata(row)?.protection_key === key) || null;
}

export async function reviewSecretaryExecutiveCalendar({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const owner = await ownerFor(context);
  const from = iso(payload.from, "from", { required: true });
  const to = iso(payload.to, "to", { required: true });
  if (Date.parse(to) <= Date.parse(from)) throw new Error("SECRETARY_CALENDAR_STEWARDSHIP_WINDOW_INVALID");
  const rules = await stewardshipRules({ context, payload });
  const events = await many(
    supabaseAdmin.from("secretary_calendar_events")
      .select("id,owner_party_id,title,description,event_type,status,starts_at,ends_at,timezone,all_day,location,source,metadata,created_at,updated_at")
      .eq("organization_id", organization)
      .eq("owner_party_id", owner)
      .neq("status", "CANCELLED")
      .lt("starts_at", to)
      .gt("ends_at", from)
      .order("starts_at", { ascending: true })
      .limit(500),
  );
  const timed = events.filter((event) => event.all_day !== true);
  const transitionRisks = [];
  for (let index = 1; index < timed.length; index += 1) {
    const risk = transitionRisk(timed[index - 1], timed[index], rules);
    if (risk) transitionRisks.push(risk);
  }
  const protections = events.filter((event) => Boolean(protectionMetadata(event)));
  return {
    status: "completed",
    contract: CONTRACT,
    owner_party_id: owner,
    from,
    to,
    event_count: events.length,
    events,
    protection_count: protections.length,
    protections,
    transition_risk_count: transitionRisks.length,
    transition_risks: transitionRisks,
    rules: {
      buffer_before_minutes: rules.before.minutes,
      buffer_before_source: rules.before.source,
      buffer_after_minutes: rules.after.minutes,
      buffer_after_source: rules.after.source,
      location_change_buffer_minutes: rules.location.minutes,
      location_change_buffer_source: rules.location.source,
      preference_register_version: rules.preference_register_version,
      explicit_instruction_overrides_preference: true,
    },
    no_calendar_mutation_performed: true,
    ...safetyFlags(),
  };
}

export async function protectSecretaryExecutiveTime({ context, payload = {} } = {}) {
  const kind = text(payload.protection_kind || payload.protectionKind || "FOCUS", 80).toUpperCase();
  if (!PROTECTION_KINDS.has(kind)) throw new Error("SECRETARY_CALENDAR_STEWARDSHIP_PROTECTION_KIND_INVALID");
  const startsAt = iso(payload.starts_at || payload.startsAt, "starts_at", { required: true });
  const endsAt = iso(payload.ends_at || payload.endsAt, "ends_at", { required: true });
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("SECRETARY_CALENDAR_STEWARDSHIP_END_BEFORE_START");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_CALENDAR_STEWARDSHIP_EVIDENCE_REQUIRED");
  const auth = await calendarRouting({
    context,
    instruction: "Protect an explicitly requested executive calendar window without moving or cancelling existing events.",
    at: startsAt,
  });
  const key = protectionKey({
    organization: auth.organization,
    owner: auth.owner,
    kind,
    startsAt,
    endsAt,
    evidenceId,
  });
  const existing = await findProtectionByKey({ organization: auth.organization, owner: auth.owner, key });
  if (existing) {
    if (existing.status === "CANCELLED") throw new Error("SECRETARY_CALENDAR_STEWARDSHIP_PROTECTION_ALREADY_RELEASED");
    return {
      status: "protected",
      contract: CONTRACT,
      protection: existing,
      replay_safe: true,
      atomic_booking: true,
      ...safetyFlags(),
    };
  }
  const title = text(payload.title, 500) || `Protected ${kind.toLowerCase()} time`;
  let event;
  try {
    event = await bookSecretaryCalendarEventAtomic({
      organizationId: auth.organization,
      entityId: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
      ownerPartyId: auth.owner,
      title,
      description: text(payload.description, 4000) || null,
      eventType: "BLOCK",
      status: "CONFIRMED",
      startsAt,
      endsAt,
      timezone: text(payload.timezone, 120) || text(context.timezone, 120) || "UTC",
      allDay: false,
      location: text(payload.location, 1000) || null,
      source: SOURCE,
      createdByPartyId: auth.actor,
      updatedByPartyId: auth.actor,
      metadata: {
        secretary_calendar_stewardship: true,
        secretary_calendar_stewardship_contract: CONTRACT,
        protection_key: key,
        protection_kind: kind,
        evidence_id: evidenceId,
        canonical_owner_party_id: auth.owner,
        operational_assignee_party_id: auth.operational,
        created_from_explicit_window: true,
        ...secretaryAdministrativeCoverageMetadata(auth.routing),
        ...safetyFlags(),
      },
    });
  } catch (error) {
    if (error?.message === "SECRETARY_CALENDAR_SLOT_UNAVAILABLE") {
      const replay = await findProtectionByKey({ organization: auth.organization, owner: auth.owner, key });
      if (replay && replay.status !== "CANCELLED") {
        return {
          status: "protected",
          contract: CONTRACT,
          protection: replay,
          replay_safe: true,
          atomic_booking: true,
          ...safetyFlags(),
        };
      }
    }
    throw error;
  }
  return {
    status: "protected",
    contract: CONTRACT,
    protection: event,
    replay_safe: false,
    atomic_booking: true,
    existing_events_moved: false,
    ...safetyFlags(),
  };
}

export async function releaseSecretaryExecutiveProtection({ context, payload = {} } = {}) {
  const protectionId = text(payload.protection_event_id || payload.protectionEventId || payload.event_id || payload.eventId, 120);
  if (!protectionId) throw new Error("SECRETARY_CALENDAR_STEWARDSHIP_PROTECTION_EVENT_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_CALENDAR_STEWARDSHIP_EVIDENCE_REQUIRED");
  const releasedAt = iso(payload.released_at || payload.releasedAt, "released_at", { required: true });
  const auth = await calendarRouting({
    context,
    instruction: "Release only an Avantiqo Secretary-created calendar protection block. Do not cancel or move external meetings.",
    at: releasedAt,
  });
  const event = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .select("*")
      .eq("organization_id", auth.organization)
      .eq("id", protectionId)
      .maybeSingle(),
  );
  if (!event) throw new Error("SECRETARY_CALENDAR_STEWARDSHIP_PROTECTION_NOT_FOUND");
  const metadata = protectionMetadata(event);
  if (!metadata || event.source !== SOURCE || event.event_type !== "BLOCK") {
    throw new Error("SECRETARY_CALENDAR_STEWARDSHIP_EXTERNAL_EVENT_RELEASE_FORBIDDEN");
  }
  if (event.owner_party_id !== auth.owner) throw new Error("SECRETARY_CALENDAR_STEWARDSHIP_OWNER_MISMATCH");
  if (event.status === "CANCELLED") {
    if (metadata.release_evidence_id === evidenceId && metadata.released_at === releasedAt) {
      return { status: "released", contract: CONTRACT, protection: event, replay_safe: true, ...safetyFlags() };
    }
    throw new Error("SECRETARY_CALENDAR_STEWARDSHIP_PROTECTION_ALREADY_RELEASED");
  }
  const nextMetadata = {
    ...object(event.metadata),
    release_evidence_id: evidenceId,
    released_at: releasedAt,
    released_by_party_id: auth.actor,
    release_reason: text(payload.reason, 2000) || null,
    external_event_cancelled: false,
    meeting_moved: false,
    ...secretaryAdministrativeCoverageMetadata(auth.routing),
    ...safetyFlags(),
  };
  const updated = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .update({
        status: "CANCELLED",
        metadata: nextMetadata,
        updated_by_party_id: auth.actor,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", auth.organization)
      .eq("id", protectionId)
      .eq("updated_at", event.updated_at)
      .select("*")
      .maybeSingle(),
  );
  if (!updated) throw new Error("SECRETARY_CALENDAR_STEWARDSHIP_CONCURRENT_UPDATE_RETRY_REQUIRED");
  return {
    status: "released",
    contract: CONTRACT,
    protection: updated,
    replay_safe: false,
    external_event_cancelled: false,
    meeting_moved: false,
    ...safetyFlags(),
  };
}

export async function listSecretaryExecutiveProtections({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const owner = await ownerFor(context);
  let query = supabaseAdmin.from("secretary_calendar_events")
    .select("*")
    .eq("organization_id", organization)
    .eq("owner_party_id", owner)
    .eq("source", SOURCE)
    .order("starts_at", { ascending: true })
    .limit(Math.min(300, Math.max(1, Number(payload.limit || 100))));
  if (payload.include_released !== true && payload.includeReleased !== true) query = query.neq("status", "CANCELLED");
  const protections = (await many(query)).filter((event) => Boolean(protectionMetadata(event)));
  return {
    status: "completed",
    contract: CONTRACT,
    owner_party_id: owner,
    count: protections.length,
    protections,
    ...safetyFlags(),
  };
}

export default {
  reviewSecretaryExecutiveCalendar,
  protectSecretaryExecutiveTime,
  releaseSecretaryExecutiveProtection,
  listSecretaryExecutiveProtections,
};
