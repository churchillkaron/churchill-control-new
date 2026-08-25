const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WRITTEN_CHANNELS = new Set(["MESSAGE", "EMAIL"]);

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
  if (Number.isInteger(value) && value >= 0 && value <= 6) return DAY_CODES[value];
  const day = text(value, 20).toUpperCase().slice(0, 3);
  return DAY_CODES.includes(day) ? day : null;
}

function normalizeDays(value) {
  const days = list(value).map(normalizeDay).filter(Boolean);
  return days.length ? new Set(days) : new Set(DAY_CODES);
}

function normalizeChannels(value) {
  return new Set(list(value).map((item) => text(item, 40).toUpperCase()).filter(Boolean));
}

function channelApplies(configured, requested) {
  if (!configured.size || configured.has("ALL") || configured.has("*")) return true;
  const channel = text(requested, 40).toUpperCase();
  if (configured.has(channel)) return true;
  if (WRITTEN_CHANNELS.has(channel) && configured.has("WRITTEN")) return true;
  return false;
}

function parseClock(value) {
  const match = text(value, 20).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function localContext(at, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
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

function windowBlocksAt(window, at, timezone, channel) {
  const item = object(window);
  const start = parseClock(item.start);
  const end = parseClock(item.end);
  if (start === null || end === null || start === end) return false;
  if (!channelApplies(normalizeChannels(item.channels), channel)) return false;

  const local = localContext(at, timezone);
  const days = normalizeDays(item.days);
  if (start < end) {
    return days.has(local.day) && local.minute_of_day >= start && local.minute_of_day < end;
  }
  return (
    (days.has(local.day) && local.minute_of_day >= start) ||
    (days.has(previousDay(local.day)) && local.minute_of_day < end)
  );
}

function windowsBlockAt(windows, at, timezone, channel) {
  return windows.some((window) => windowBlocksAt(window, at, timezone, channel));
}

function nextAllowedAt({ startAt, untilAt = null, windows, timezone, channel }) {
  let cursorMs = Math.max(startAt.getTime(), untilAt?.getTime?.() || 0);
  const maxMs = cursorMs + 8 * 24 * 60 * 60 * 1000;
  if (cursorMs > startAt.getTime()) cursorMs += 1000;

  while (cursorMs <= maxMs) {
    const candidate = new Date(cursorMs);
    const untilStillBlocks = untilAt && candidate.getTime() < untilAt.getTime();
    if (!untilStillBlocks && !windowsBlockAt(windows, candidate, timezone, channel)) {
      return candidate.toISOString();
    }
    cursorMs += 5 * 60 * 1000;
  }
  return null;
}

function configuredWindows(policy) {
  if (policy.enabled === false) return [];
  const windows = [...list(policy.windows)];
  if (parseClock(policy.start) !== null && parseClock(policy.end) !== null) {
    windows.push({
      start: policy.start,
      end: policy.end,
      days: policy.days,
      channels: policy.channels,
    });
  }
  return windows;
}

export function evaluateSecretaryContactQuietHours({
  doNotDisturb = {},
  timezone = "UTC",
  channel = "MESSAGE",
  now = new Date(),
} = {}) {
  const policy = object(doNotDisturb);
  const at = now instanceof Date ? now : new Date(now);
  const effectiveTimezone = validTimezone(policy.timezone || timezone || "UTC");
  const windows = configuredWindows(policy);

  const untilMs = policy.enabled === false
    ? NaN
    : Date.parse(text(policy.until || policy.blocked_until || policy.do_not_disturb_until, 120));
  const untilAt = Number.isFinite(untilMs) && untilMs > at.getTime() ? new Date(untilMs) : null;
  const hasTemporaryPolicy = Boolean(untilAt || windows.length);
  const permanent =
    policy.blocked === true ||
    policy.do_not_disturb === true ||
    policy.permanent === true ||
    (policy.active === true && !hasTemporaryPolicy);

  if (permanent) {
    return {
      blocked: true,
      permanent: true,
      reason: "CONTACT_DO_NOT_DISTURB",
      timezone: effectiveTimezone,
      defer_until: null,
    };
  }

  const scheduled = windowsBlockAt(windows, at, effectiveTimezone, channel);
  if (!untilAt && !scheduled) {
    return {
      blocked: false,
      permanent: false,
      reason: null,
      timezone: effectiveTimezone,
      defer_until: null,
    };
  }

  const deferUntil = nextAllowedAt({
    startAt: at,
    untilAt,
    windows,
    timezone: effectiveTimezone,
    channel,
  });

  return {
    blocked: true,
    permanent: !deferUntil,
    reason: untilAt ? "CONTACT_DO_NOT_DISTURB_UNTIL" : "CONTACT_QUIET_HOURS",
    timezone: effectiveTimezone,
    defer_until: deferUntil,
  };
}

export const SECRETARY_CONTACT_QUIET_HOURS_CONTRACT = Object.freeze({
  do_not_disturb: {
    permanent_flags: ["blocked", "do_not_disturb", "permanent"],
    legacy_active_behavior: "active=true is permanent only when no temporary window or until-rule is configured",
    enabled_behavior: "enabled=false disables temporary schedules; enabled=true does not create a permanent block",
    until_fields: ["until", "blocked_until", "do_not_disturb_until"],
    windows: {
      forms: "windows[] or top-level start/end/days/channels",
      days: "SUN..SAT or 0..6; omitted means every day",
      start: "HH:mm local contact time",
      end: "HH:mm local contact time; overnight windows are supported",
      channels: "CALL, MESSAGE, EMAIL, WRITTEN, ALL; omitted means all channels",
    },
  },
});

export default evaluateSecretaryContactQuietHours;
