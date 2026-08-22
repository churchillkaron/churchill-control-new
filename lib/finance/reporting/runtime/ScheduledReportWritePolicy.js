import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const FREQUENCIES = new Set(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]);
export const FINANCE_SCHEDULE_TIMEZONES = new Set([
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Stockholm",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
]);

export function dateTimePartsInZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

export function localDateTimeToUtc(value, timeZone) {
  const match = String(value || "").trim().match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) throw new Error("First Run must be a valid local date and time");

  const desired = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  };

  let candidate = new Date(Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second
  ));

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = dateTimePartsInZone(candidate, timeZone);
    const desiredUtc = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, desired.second);
    const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const difference = desiredUtc - actualUtc;
    if (difference === 0) break;
    candidate = new Date(candidate.getTime() + difference);
  }

  const finalParts = dateTimePartsInZone(candidate, timeZone);
  for (const key of ["year", "month", "day", "hour", "minute"]) {
    if (finalParts[key] !== desired[key]) {
      throw new Error("First Run is not a valid local time in the selected timezone");
    }
  }

  return candidate.toISOString();
}

export function normalizeScheduledReportPayload(payload) {
  const normalized = { ...(payload || {}) };
  if (Object.prototype.hasOwnProperty.call(normalized, "name")) {
    normalized.name = String(normalized.name || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "frequency")) {
    normalized.frequency = String(normalized.frequency || "").trim().toUpperCase();
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "timezone")) {
    normalized.timezone = String(normalized.timezone || "").trim();
  }
  if (
    normalized.next_run_at &&
    normalized.timezone &&
    !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(String(normalized.next_run_at))
  ) {
    normalized.next_run_at = localDateTimeToUtc(normalized.next_run_at, normalized.timezone);
  }
  return normalized;
}

export async function validateScheduledReportWrite({ organizationId, payload, recordId = null }) {
  let candidate = { ...(payload || {}) };

  if (recordId) {
    const { data: existing, error } = await supabaseAdmin
      .from("finance_scheduled_reports")
      .select("id, entity_id, report_template_id, name, frequency, next_run_at, timezone, status")
      .eq("organization_id", organizationId)
      .eq("id", recordId)
      .maybeSingle();
    if (error) throw error;
    if (!existing) throw new Error("Scheduled Report not found");
    candidate = { ...existing, ...candidate };
  }

  candidate = normalizeScheduledReportPayload(candidate);
  Object.assign(payload, normalizeScheduledReportPayload(payload));

  if (!candidate.name) throw new Error("Schedule Name required");
  if (!candidate.entity_id) throw new Error("Legal Entity required");
  if (!candidate.report_template_id) throw new Error("Report Template required");
  if (!FREQUENCIES.has(candidate.frequency)) throw new Error("Scheduled Report frequency is not supported");
  if (!FINANCE_SCHEDULE_TIMEZONES.has(candidate.timezone)) throw new Error("Scheduled Report timezone is not supported");
  if (!candidate.next_run_at || Number.isNaN(new Date(candidate.next_run_at).getTime())) {
    throw new Error("First Run must be a valid date and time");
  }

  const { data: entity, error: entityError } = await supabaseAdmin
    .from("legal_entities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", candidate.entity_id)
    .maybeSingle();
  if (entityError) throw entityError;
  if (!entity) throw new Error("Legal Entity not found in this organisation");

  const { data: template, error: templateError } = await supabaseAdmin
    .from("finance_report_templates")
    .select("id, status, report_type")
    .eq("organization_id", organizationId)
    .eq("id", candidate.report_template_id)
    .maybeSingle();
  if (templateError) throw templateError;
  if (!template) throw new Error("Report Template not found in this organisation");
  if (String(template.status || "").toUpperCase() !== "ACTIVE") {
    throw new Error("Report Template must be active before it can be scheduled");
  }

  const reportType = String(template.report_type || "").trim().toLowerCase();
  if (!["profit_loss", "balance_sheet", "cash_flow", "trial_balance"].includes(reportType)) {
    throw new Error("Report Template is not bound to a supported Finance report engine");
  }
}