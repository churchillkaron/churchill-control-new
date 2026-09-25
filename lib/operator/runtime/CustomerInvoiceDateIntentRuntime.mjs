const WEEKDAY = new Map([
  ["sunday", 0],
  ["monday", 1],
  ["tuesday", 2],
  ["wednesday", 3],
  ["thursday", 4],
  ["friday", 5],
  ["saturday", 6],
]);

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function todayIso(timezone = "Asia/Bangkok", now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function dateFromDayOffset(baseIso, offset) {
  const date = new Date(`${baseIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function nextWeekday(baseIso, target) {
  const base = new Date(`${baseIso}T12:00:00Z`);
  let delta = (target - base.getUTCDay() + 7) % 7;
  if (delta === 0) delta = 7;
  return dateFromDayOffset(baseIso, delta);
}

function previousWeekday(baseIso, target) {
  const base = new Date(`${baseIso}T12:00:00Z`);
  let delta = (base.getUTCDay() - target + 7) % 7;
  if (delta === 0) delta = 7;
  return dateFromDayOffset(baseIso, -delta);
}

function weekdayFromMatch(match) {
  if (!match) return null;
  const value = String(match[0])
    .match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)?.[1]
    ?.toLowerCase();
  return value && WEEKDAY.has(value) ? WEEKDAY.get(value) : null;
}

export function resolveCustomerInvoiceDatePlan({
  message,
  timezone = "Asia/Bangkok",
  fallbackInvoiceDate = null,
  fallbackDueDate = null,
  expectedLines = 2,
  now = new Date(),
} = {}) {
  const lower = text(message).toLowerCase();
  const today = todayIso(timezone, now);
  const weekdayPattern =
    "(sunday|monday|tuesday|wednesday|thursday|friday|saturday)";

  const shared = lower.match(
    new RegExp(
      `\\b${weekdayPattern}\\b[^.?!\\n]{0,50}\\b(?:due\\s+date[^.?!\\n]{0,30}invoice\\s+date|invoice\\s+date[^.?!\\n]{0,30}due\\s+date)\\b`,
      "i",
    ),
  );
  const invoiceOnly = lower.match(
    new RegExp(
      `\\b${weekdayPattern}\\b[^.?!\\n]{0,24}\\binvoice\\s+date\\b|\\binvoice\\s+date[^.?!\\n]{0,24}\\b${weekdayPattern}\\b`,
      "i",
    ),
  );
  const dueOnly = lower.match(
    new RegExp(
      `\\b${weekdayPattern}\\b[^.?!\\n]{0,24}\\bdue\\s+date\\b|\\bdue\\s+date[^.?!\\n]{0,24}\\b${weekdayPattern}\\b`,
      "i",
    ),
  );

  const sharedWeekday = weekdayFromMatch(shared);
  const invoiceWeekday = sharedWeekday ?? weekdayFromMatch(invoiceOnly);
  const dueWeekday = sharedWeekday ?? weekdayFromMatch(dueOnly);

  const invoiceDate =
    invoiceWeekday == null
      ? fallbackInvoiceDate || today
      : nextWeekday(today, invoiceWeekday);
  const dueDate =
    dueWeekday == null
      ? fallbackDueDate || invoiceDate
      : nextWeekday(today, dueWeekday);

  const previous = lower.match(
    /\b(?:previous|last)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s*(?:,|and|&)\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday))?/i,
  );
  const serviceDates = previous
    ? [...new Set(
        [previous[1], previous[2]]
          .filter(Boolean)
          .map((name) => previousWeekday(invoiceDate, WEEKDAY.get(name))),
      )].slice(0, Math.max(1, Number(expectedLines) || 1))
    : [];

  return {
    invoice_date: invoiceDate,
    due_date: dueDate,
    service_dates: serviceDates,
  };
}

export default Object.freeze({ resolveCustomerInvoiceDatePlan });
