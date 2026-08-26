import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function iso(value, field) {
  const raw = text(value, 160);
  if (!raw || !Number.isFinite(Date.parse(raw))) throw new Error(`SECRETARY_MEETING_CANDIDATE_${field.toUpperCase()}_INVALID`);
  return new Date(raw).toISOString();
}

function boundedDurationMinutes(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 5 || duration > 1440) {
    throw new Error("SECRETARY_MEETING_CANDIDATE_DURATION_INVALID");
  }
  return Math.floor(duration);
}

function normalizeBusyWindows(busyWindows, windowStartMs, windowEndMs) {
  const normalized = list(busyWindows)
    .map((item) => {
      const row = object(item);
      const startsAt = Date.parse(row.starts_at || row.startsAt || "");
      const endsAt = Date.parse(row.ends_at || row.endsAt || "");
      if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return null;
      return {
        starts_at_ms: Math.max(startsAt, windowStartMs),
        ends_at_ms: Math.min(endsAt, windowEndMs),
      };
    })
    .filter((row) => row && row.ends_at_ms > row.starts_at_ms)
    .sort((left, right) => left.starts_at_ms - right.starts_at_ms || left.ends_at_ms - right.ends_at_ms);

  const merged = [];
  for (const row of normalized) {
    const previous = merged[merged.length - 1];
    if (!previous || row.starts_at_ms > previous.ends_at_ms) {
      merged.push({ ...row });
      continue;
    }
    previous.ends_at_ms = Math.max(previous.ends_at_ms, row.ends_at_ms);
  }
  return merged;
}

export function buildSecretaryMeetingCandidateSlots({
  windowStart,
  windowEnd,
  durationMinutes,
  timezone,
  busyWindows = [],
  maxSlots = 20,
} = {}) {
  const startsAt = iso(windowStart, "window_start");
  const endsAt = iso(windowEnd, "window_end");
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (endMs <= startMs) throw new Error("SECRETARY_MEETING_CANDIDATE_WINDOW_INVALID");

  const duration = boundedDurationMinutes(durationMinutes);
  const durationMs = duration * 60_000;
  if (durationMs > endMs - startMs) throw new Error("SECRETARY_MEETING_CANDIDATE_WINDOW_TOO_SHORT");

  const tz = text(timezone, 120);
  if (!tz) throw new Error("SECRETARY_MEETING_CANDIDATE_TIMEZONE_REQUIRED");

  const slotLimit = Math.max(1, Math.min(Number(maxSlots) || 20, 20));
  const busy = normalizeBusyWindows(busyWindows, startMs, endMs);
  const slots = [];
  let cursor = startMs;

  const appendGap = (gapEnd) => {
    while (slots.length < slotLimit && cursor + durationMs <= gapEnd) {
      const slotStart = cursor;
      const slotEnd = cursor + durationMs;
      slots.push({
        id: `slot-${slots.length + 1}`,
        starts_at: new Date(slotStart).toISOString(),
        ends_at: new Date(slotEnd).toISOString(),
        timezone: tz,
        label: `Option ${slots.length + 1}`,
      });
      cursor = slotEnd;
    }
  };

  for (const blocked of busy) {
    if (slots.length >= slotLimit) break;
    if (blocked.ends_at_ms <= cursor) continue;
    if (blocked.starts_at_ms > cursor) appendGap(blocked.starts_at_ms);
    cursor = Math.max(cursor, blocked.ends_at_ms);
  }
  if (slots.length < slotLimit && cursor < endMs) appendGap(endMs);

  return {
    candidate_slots: slots,
    explicit_window: {
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: tz,
      duration_minutes: duration,
    },
    busy_window_count: busy.length,
    candidate_slot_count: slots.length,
    owner_calendar_checked: true,
    business_hours_invented: false,
    calendar_event_created: false,
    external_authority_used: false,
  };
}

export async function generateSecretaryMeetingCandidateSlots({ context = {}, payload = {} } = {}) {
  const organizationId = text(context.organizationId, 120);
  if (!organizationId) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  const requestedBy = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!requestedBy) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");

  const ownerPartyId = text(payload.owner_party_id || payload.ownerPartyId, 120) || requestedBy;
  const timezone = text(payload.timezone || context.timezone, 120);
  if (!timezone) throw new Error("SECRETARY_MEETING_CANDIDATE_TIMEZONE_REQUIRED");

  const candidateWindow = object(payload.candidate_window || payload.candidateWindow);
  const windowStart = iso(candidateWindow.starts_at || candidateWindow.startsAt, "window_start");
  const windowEnd = iso(candidateWindow.ends_at || candidateWindow.endsAt, "window_end");
  const durationMinutes = boundedDurationMinutes(payload.duration_minutes || payload.durationMinutes);
  if (Date.parse(windowEnd) <= Date.parse(windowStart)) throw new Error("SECRETARY_MEETING_CANDIDATE_WINDOW_INVALID");

  const busyResult = await supabaseAdmin
    .from("secretary_calendar_events")
    .select("id,starts_at,ends_at,status")
    .eq("organization_id", organizationId)
    .eq("owner_party_id", ownerPartyId)
    .neq("status", "CANCELLED")
    .lt("starts_at", windowEnd)
    .gt("ends_at", windowStart)
    .order("starts_at", { ascending: true });
  if (busyResult.error) throw busyResult.error;

  const generated = buildSecretaryMeetingCandidateSlots({
    windowStart,
    windowEnd,
    durationMinutes,
    timezone,
    busyWindows: busyResult.data || [],
    maxSlots: 20,
  });

  if (!generated.candidate_slots.length) {
    throw new Error("SECRETARY_MEETING_COORDINATION_NO_OWNER_AVAILABILITY_IN_WINDOW");
  }

  return {
    ...generated,
    owner_party_id: ownerPartyId,
    candidate_slots_generated_from_explicit_window: true,
    owner_calendar_busy_event_count: list(busyResult.data).length,
    source: "SECRETARY_OWNER_CALENDAR",
  };
}

export default Object.freeze({
  build: buildSecretaryMeetingCandidateSlots,
  generate: generateSecretaryMeetingCandidateSlots,
});
