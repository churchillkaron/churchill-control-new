import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { run as runReport } from "./ReportingApplicationService";
import {
  dateTimePartsInZone,
  localDateTimeToUtc,
} from "./ScheduledReportWritePolicy";

const EXECUTABLE_REPORTS = new Set([
  "profit_loss",
  "balance_sheet",
  "cash_flow",
  "trial_balance",
]);
const LEASE_MILLISECONDS = 60 * 60 * 1000;

function pad(value) {
  return String(value).padStart(2, "0");
}

function localIso(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second || 0)}`;
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addLocalMonths(local, months) {
  const absoluteMonth = local.year * 12 + (local.month - 1) + months;
  const year = Math.floor(absoluteMonth / 12);
  const monthIndex = absoluteMonth % 12;
  const month = monthIndex + 1;
  return {
    ...local,
    year,
    month,
    day: Math.min(local.day, lastDayOfMonth(year, month)),
  };
}

function nextRunAt(currentValue, frequency, timeZone) {
  const current = new Date(currentValue);
  if (Number.isNaN(current.getTime())) throw new Error("Scheduled report next_run_at is invalid");

  const local = dateTimePartsInZone(current, timeZone);
  const normalizedFrequency = String(frequency || "").toUpperCase();
  let next;

  if (normalizedFrequency === "DAILY" || normalizedFrequency === "WEEKLY") {
    const increment = normalizedFrequency === "DAILY" ? 1 : 7;
    const date = new Date(Date.UTC(local.year, local.month - 1, local.day + increment));
    next = {
      ...local,
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  } else if (normalizedFrequency === "MONTHLY") {
    next = addLocalMonths(local, 1);
  } else if (normalizedFrequency === "QUARTERLY") {
    next = addLocalMonths(local, 3);
  } else if (normalizedFrequency === "YEARLY") {
    const year = local.year + 1;
    next = {
      ...local,
      year,
      day: Math.min(local.day, lastDayOfMonth(year, local.month)),
    };
  } else {
    throw new Error("Scheduled report frequency is not supported");
  }

  return localDateTimeToUtc(localIso(next), timeZone);
}

function estimateRowCount(result) {
  if (Array.isArray(result?.rows)) return result.rows.length;
  const document = result?.document;
  if (!document || typeof document !== "object") return 0;
  for (const key of ["rows", "lines", "items", "sections"]) {
    if (Array.isArray(document[key])) return document[key].length;
  }
  return 0;
}

async function claimDueSchedule(schedule) {
  const scheduledFor = schedule.next_run_at;
  const leasedUntil = new Date(Date.now() + LEASE_MILLISECONDS).toISOString();

  const { data, error } = await supabaseAdmin
    .from("finance_scheduled_reports")
    .update({ next_run_at: leasedUntil, updated_at: new Date().toISOString() })
    .eq("organization_id", schedule.organization_id)
    .eq("id", schedule.id)
    .eq("status", "ACTIVE")
    .eq("next_run_at", scheduledFor)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

async function resolveCurrentPeriod(schedule) {
  const local = dateTimePartsInZone(
    new Date(schedule.next_run_at || Date.now()),
    schedule.timezone
  );
  const executionDate = `${local.year}-${pad(local.month)}-${pad(local.day)}`;

  const { data: periods, error } = await supabaseAdmin
    .from("accounting_periods")
    .select("id, entity_id, start_date, end_date, status")
    .eq("organization_id", schedule.organization_id)
    .lte("start_date", executionDate)
    .gte("end_date", executionDate)
    .or(`entity_id.eq.${schedule.entity_id},entity_id.is.null`)
    .order("start_date", { ascending: false });

  if (error) throw error;
  const rows = Array.isArray(periods) ? periods : [];
  const ranked = [...rows].sort((left, right) => {
    const leftEntity = left.entity_id === schedule.entity_id ? 1 : 0;
    const rightEntity = right.entity_id === schedule.entity_id ? 1 : 0;
    if (leftEntity !== rightEntity) return rightEntity - leftEntity;
    const leftOpen = String(left.status || "").toUpperCase() === "OPEN" ? 1 : 0;
    const rightOpen = String(right.status || "").toUpperCase() === "OPEN" ? 1 : 0;
    return rightOpen - leftOpen;
  });

  if (!ranked[0]) {
    throw new Error("No accounting period covers the scheduled execution date");
  }
  return ranked[0];
}

async function executeSchedule(schedule) {
  const { data: template, error: templateError } = await supabaseAdmin
    .from("finance_report_templates")
    .select("id, name, report_type, status")
    .eq("organization_id", schedule.organization_id)
    .eq("id", schedule.report_template_id)
    .maybeSingle();

  if (templateError) throw templateError;
  if (!template) throw new Error("Scheduled Report Template not found");
  if (String(template.status || "").toUpperCase() !== "ACTIVE") {
    throw new Error("Scheduled Report Template is not active");
  }

  const reportType = String(template.report_type || "").trim().toLowerCase();
  if (!EXECUTABLE_REPORTS.has(reportType)) {
    throw new Error("Scheduled Report Template is not bound to a supported report engine");
  }

  const period = await resolveCurrentPeriod(schedule);
  const result = await runReport(reportType, {
    organizationId: schedule.organization_id,
    entityId: schedule.entity_id,
    periodId: period.id,
  });

  const now = new Date().toISOString();
  const { data: run, error: runError } = await supabaseAdmin
    .from("finance_report_runs")
    .insert({
      organization_id: schedule.organization_id,
      entity_id: schedule.entity_id,
      report_definition_id: null,
      report_template_id: template.id,
      scheduled_report_id: schedule.id,
      run_type: "SCHEDULED",
      row_count: estimateRowCount(result),
      output_format: "JSON",
      output: {
        ...result,
        schedule: {
          period_id: period.id,
          execution_date: schedule.next_run_at,
          timezone: schedule.timezone,
        },
      },
      status: "COMPLETED",
      completed_at: now,
      created_by: null,
    })
    .select("id")
    .single();

  if (runError) throw runError;

  const { error: updateError } = await supabaseAdmin
    .from("finance_scheduled_reports")
    .update({
      last_run_at: now,
      last_run_id: run.id,
      next_run_at: nextRunAt(schedule.next_run_at, schedule.frequency, schedule.timezone),
      updated_at: now,
    })
    .eq("organization_id", schedule.organization_id)
    .eq("id", schedule.id);

  if (updateError) throw updateError;
  return {
    schedule_id: schedule.id,
    run_id: run.id,
    report_type: reportType,
    period_id: period.id,
  };
}

export async function processDueScheduledReports({ limit = 25 } = {}) {
  const now = new Date().toISOString();
  const { data: schedules, error } = await supabaseAdmin
    .from("finance_scheduled_reports")
    .select("id, organization_id, entity_id, report_template_id, frequency, next_run_at, timezone, status")
    .eq("status", "ACTIVE")
    .lte("next_run_at", now)
    .order("next_run_at", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 25, 100)));

  if (error) throw error;

  const results = [];
  for (const schedule of schedules || []) {
    let claimed = false;
    try {
      if (!schedule.entity_id) throw new Error("Scheduled Report Legal Entity is missing");
      if (!schedule.report_template_id) throw new Error("Scheduled Report Template is missing");
      if (!schedule.timezone) throw new Error("Scheduled Report timezone is missing");

      claimed = await claimDueSchedule(schedule);
      if (!claimed) continue;

      results.push({ success: true, ...(await executeSchedule(schedule)) });
    } catch (runError) {
      if (claimed) {
        const failedAt = new Date().toISOString();
        const retryAt = new Date(Date.now() + LEASE_MILLISECONDS).toISOString();
        await supabaseAdmin
          .from("finance_scheduled_reports")
          .update({ next_run_at: retryAt, updated_at: failedAt })
          .eq("organization_id", schedule.organization_id)
          .eq("id", schedule.id);
      }
      results.push({
        success: false,
        schedule_id: schedule.id,
        error: runError?.message || "Scheduled report failed",
      });
    }
  }

  return {
    success: results.every((item) => item.success),
    processed: results.length,
    completed: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
    results,
  };
}
