const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_NAMES = {
  sunday: "SUN",
  monday: "MON",
  tuesday: "TUE",
  wednesday: "WED",
  thursday: "THU",
  friday: "FRI",
  saturday: "SAT",
};

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function validTimezone(value) {
  const timezone = text(value, 120) || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "UTC";
  }
}

function normalizeDay(value) {
  const raw = text(value, 40).toLowerCase();
  if (DAY_NAMES[raw]) return DAY_NAMES[raw];
  const short = raw.slice(0, 3).toUpperCase();
  return DAY_CODES.includes(short) ? short : null;
}

function parseClock(value) {
  const match = text(value, 20).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function localContext(at, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    day: normalizeDay(map.weekday),
    minute_of_day: Number(map.hour) * 60 + Number(map.minute),
  };
}

function previousDay(day) {
  const index = DAY_CODES.indexOf(day);
  return DAY_CODES[(index + 6) % 7];
}

function rangesForDay(hours, day) {
  const root = object(hours);
  const weekly = object(root.weekly || root.schedule || root.days);
  const longName = Object.entries(DAY_NAMES).find(([, code]) => code === day)?.[0];
  const raw = weekly[day] ?? weekly[day.toLowerCase()] ?? (longName ? weekly[longName] : undefined) ?? root[day] ?? root[day.toLowerCase()] ?? (longName ? root[longName] : undefined);
  if (raw === undefined || raw === null) return [];
  if (raw === false || object(raw).closed === true) return [];

  const values = Array.isArray(raw) ? raw : [raw];
  return values.map((entry) => {
    if (typeof entry === "string") {
      const [start, end] = entry.split("-").map((part) => text(part, 20));
      return { start, end };
    }
    const item = object(entry);
    return {
      start: text(item.start || item.open || item.from, 20),
      end: text(item.end || item.close || item.to, 20),
    };
  }).filter((entry) => parseClock(entry.start) !== null && parseClock(entry.end) !== null);
}

function hasConfiguredSchedule(hours) {
  const root = object(hours);
  if (root.always_open === true || root.alwaysOpen === true) return true;
  const schedule = object(root.weekly || root.schedule || root.days);
  if (Object.keys(schedule).length) return true;
  return [...DAY_CODES, ...Object.keys(DAY_NAMES)].some((day) => root[day] !== undefined || root[day.toLowerCase()] !== undefined);
}

function rangeContains(range, localMinute, sameDay) {
  const start = parseClock(range.start);
  const end = parseClock(range.end);
  if (start === null || end === null || start === end) return false;
  if (start < end) return sameDay && localMinute >= start && localMinute < end;
  return sameDay ? localMinute >= start : localMinute < end;
}

function openAt(hours, at, timezone) {
  const root = object(hours);
  if (root.closed === true || root.temporarily_closed === true) return false;
  if (root.always_open === true || root.alwaysOpen === true) return true;
  if (!hasConfiguredSchedule(root)) return true;

  const local = localContext(at, timezone);
  const today = rangesForDay(root, local.day);
  if (today.some((range) => rangeContains(range, local.minute_of_day, true))) return true;
  const yesterday = rangesForDay(root, previousDay(local.day));
  return yesterday.some((range) => {
    const start = parseClock(range.start);
    const end = parseClock(range.end);
    return start !== null && end !== null && start > end && rangeContains(range, local.minute_of_day, false);
  });
}

function nextStateChange(hours, at, timezone) {
  const initial = openAt(hours, at, timezone);
  let cursor = at.getTime() + 5 * 60 * 1000;
  const max = at.getTime() + 8 * 24 * 60 * 60 * 1000;
  while (cursor <= max) {
    const candidate = new Date(cursor);
    if (openAt(hours, candidate, timezone) !== initial) return candidate.toISOString();
    cursor += 5 * 60 * 1000;
  }
  return null;
}

function normalizeMode(value, fallback = "FULL_SERVICE") {
  const mode = text(value, 60).toUpperCase();
  return ["FULL_SERVICE", "RECEPTION_ONLY", "CLOSED_REPLY"].includes(mode) ? mode : fallback;
}

export function resolveSecretaryBusinessHoursState({
  businessHours = {},
  handlingPolicy = {},
  timezone = "UTC",
  channel = "MESSAGE",
  now = new Date(),
} = {}) {
  const hours = object(businessHours);
  const policy = object(handlingPolicy);
  const at = now instanceof Date ? now : new Date(now);
  const effectiveTimezone = validTimezone(hours.timezone || timezone || "UTC");
  const isOpen = openAt(hours, at, effectiveTimezone);
  const afterHoursMode = normalizeMode(
    policy.after_hours_mode || policy.afterHoursMode,
    "FULL_SERVICE",
  );
  const nextChangeAt = hasConfiguredSchedule(hours)
    ? nextStateChange(hours, at, effectiveTimezone)
    : null;

  return {
    is_open: isOpen,
    is_after_hours: !isOpen,
    after_hours_mode: isOpen ? "FULL_SERVICE" : afterHoursMode,
    timezone: effectiveTimezone,
    channel: text(channel, 40).toUpperCase() || "MESSAGE",
    next_state_change_at: nextChangeAt,
    schedule_configured: hasConfiguredSchedule(hours),
  };
}

export function secretaryAfterHoursAllowedDecisionActions(state, { includeNoReply = false } = {}) {
  const context = object(state);
  if (!context.is_after_hours || context.after_hours_mode === "FULL_SERVICE") return null;
  if (context.after_hours_mode === "CLOSED_REPLY") {
    return includeNoReply
      ? ["ANSWER", "LEAVE_MESSAGE", "CLARIFY", "NO_REPLY"]
      : ["ANSWER", "LEAVE_MESSAGE", "CLARIFY"];
  }
  return includeNoReply
    ? ["ANSWER", "REQUEST_CALLBACK", "LEAVE_MESSAGE", "CLARIFY", "NO_REPLY"]
    : ["ANSWER", "REQUEST_CALLBACK", "LEAVE_MESSAGE", "CLARIFY"];
}

export const SECRETARY_BUSINESS_HOURS_CONTRACT = Object.freeze({
  unconfigured_behavior: "FULL_SERVICE_24_7",
  business_hours: {
    timezone: "IANA timezone; falls back to Secretary default timezone",
    always_open: "boolean",
    weekly: "day keys SUN..SAT or full weekday names; values may be {start,end}, arrays, or HH:mm-HH:mm strings; overnight ranges supported",
  },
  after_hours_modes: ["FULL_SERVICE", "RECEPTION_ONLY", "CLOSED_REPLY"],
});

export default resolveSecretaryBusinessHoursState;
