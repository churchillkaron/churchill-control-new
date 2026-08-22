import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { financeGateway } from "@/lib/finance/runtime/financeGateway";

const FREQUENCIES = new Set(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]);

function pad(value) {
  return String(value).padStart(2, "0");
}

function isoDate(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function dateInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function validateTimeZone(value) {
  const timeZone = String(value || "").trim();
  if (!timeZone) throw new Error("Recurring Journal timezone is missing");
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone }).format(new Date());
  } catch {
    throw new Error("Recurring Journal timezone is invalid");
  }
  return timeZone;
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(dateValue, months) {
  const current = new Date(`${dateValue}T00:00:00.000Z`);
  const originalDay = current.getUTCDate();
  const absoluteMonth = current.getUTCFullYear() * 12 + current.getUTCMonth() + months;
  const year = Math.floor(absoluteMonth / 12);
  const monthIndex = absoluteMonth % 12;
  const month = monthIndex + 1;
  const day = Math.min(originalDay, lastDayOfMonth(year, month));
  return `${year}-${pad(month)}-${pad(day)}`;
}

function nextRunDate(currentDate, frequency) {
  const normalized = String(frequency || "").trim().toUpperCase();
  if (!FREQUENCIES.has(normalized)) {
    throw new Error("Recurring Journal frequency is not supported");
  }

  if (normalized === "MONTHLY") return addMonths(currentDate, 1);
  if (normalized === "QUARTERLY") return addMonths(currentDate, 3);
  if (normalized === "YEARLY") return addMonths(currentDate, 12);

  const current = new Date(`${currentDate}T00:00:00.000Z`);
  const days = normalized === "DAILY" ? 1 : 7;
  current.setUTCDate(current.getUTCDate() + days);
  return isoDate(current);
}

function validateTemplate(template) {
  if (!template?.organization_id) throw new Error("Recurring Journal organization is missing");
  if (!template?.entity_id) throw new Error("Recurring Journal legal entity is missing");
  if (!template?.id) throw new Error("Recurring Journal template id is missing");
  if (!template?.next_run_date) throw new Error("Recurring Journal next run date is missing");
  validateTimeZone(template.timezone);
  if (!FREQUENCIES.has(String(template.frequency || "").toUpperCase())) {
    throw new Error("Recurring Journal frequency is not supported");
  }
  const exchangeRate = Number(template.exchange_rate);
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error("Recurring Journal exchange rate must be greater than zero");
  }
  if (!Array.isArray(template.lines) || template.lines.length < 2) {
    throw new Error("Recurring Journal requires at least two balanced lines");
  }
}

function isDue(template, now = new Date()) {
  const timeZone = validateTimeZone(template.timezone);
  return String(template.next_run_date) <= dateInTimeZone(now, timeZone);
}

async function claimOccurrence(template) {
  const { data, error } = await supabaseAdmin.rpc(
    "claim_finance_recurring_journal_run",
    {
      p_organization_id: template.organization_id,
      p_entity_id: template.entity_id,
      p_template_id: template.id,
      p_scheduled_date: template.next_run_date,
    }
  );
  if (error) throw new Error(error.message);
  return data || null;
}

async function markRunFailed(runId, error) {
  if (!runId) return;
  const failedAt = new Date().toISOString();
  const retryAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from("finance_recurring_journal_runs")
    .update({
      status: "FAILED",
      error_message: String(error?.message || "Recurring Journal execution failed").slice(0, 2000),
      next_retry_at: retryAt,
      updated_at: failedAt,
    })
    .eq("id", runId)
    .eq("status", "CLAIMED");
}

async function executeOccurrence(template, runId) {
  const scheduledDate = template.next_run_date;
  const posting = await financeGateway({
    type: "DIRECT_JOURNAL_POST",
    payload: {
      organizationId: template.organization_id,
      entityId: template.entity_id,
      postingDate: scheduledDate,
      documentDate: scheduledDate,
      journalType: "RECURRING",
      reference: template.reference || template.name || null,
      sourceModule: "FINANCE",
      sourceDocument: "RECURRING_JOURNAL_TEMPLATE",
      sourceDocumentId: template.id,
      description: template.description || template.name || "Recurring journal",
      currencyCode: String(template.currency_code || "").trim().toUpperCase(),
      exchangeRate: Number(template.exchange_rate),
      lines: template.lines,
      createdBy: null,
      idempotencyKey: `recurring-journal:${template.id}:${scheduledDate}`,
    },
  });

  const journalEntryId = posting?.journal?.id || posting?.ledger?.journalEntryId || null;
  if (!journalEntryId) {
    throw new Error("Recurring Journal posting did not return a journal entry id");
  }

  const calculatedNextDate = nextRunDate(scheduledDate, template.frequency);
  const hasEnded = Boolean(template.end_date && calculatedNextDate > template.end_date);
  const { data: finalized, error: finalizeError } = await supabaseAdmin.rpc(
    "finalize_finance_recurring_journal_run",
    {
      p_run_id: runId,
      p_template_id: template.id,
      p_scheduled_date: scheduledDate,
      p_journal_entry_id: journalEntryId,
      p_next_run_date: calculatedNextDate,
      p_has_ended: hasEnded,
    }
  );
  if (finalizeError) throw new Error(finalizeError.message);

  return {
    run_id: runId,
    template_id: template.id,
    scheduled_date: scheduledDate,
    journal_entry_id: journalEntryId,
    next_run_date: calculatedNextDate,
    completed: hasEnded,
    idempotent: Boolean(posting?.ledger?.idempotentReplay || finalized?.idempotent),
  };
}

export async function processDueRecurringJournals({ limit = 25 } = {}) {
  const tomorrowUtc = new Date();
  tomorrowUtc.setUTCDate(tomorrowUtc.getUTCDate() + 1);
  const upperDate = isoDate(tomorrowUtc);

  const { data: candidates, error } = await supabaseAdmin
    .from("finance_recurring_journal_templates")
    .select("id, organization_id, entity_id, name, reference, frequency, next_run_date, end_date, currency_code, exchange_rate, timezone, description, lines, status")
    .eq("status", "ACTIVE")
    .lte("next_run_date", upperDate)
    .order("next_run_date", { ascending: true })
    .limit(Math.max(10, Math.min((Number(limit) || 25) * 4, 400)));

  if (error) throw error;

  const templates = (candidates || [])
    .filter(template => {
      try {
        return isDue(template);
      } catch {
        return true;
      }
    })
    .slice(0, Math.max(1, Math.min(Number(limit) || 25, 100)));

  const results = [];
  for (const template of templates) {
    let runId = null;
    try {
      validateTemplate(template);
      if (!isDue(template)) {
        results.push({ success: true, skipped: true, template_id: template.id });
        continue;
      }
      runId = await claimOccurrence(template);
      if (!runId) {
        results.push({ success: true, skipped: true, template_id: template.id });
        continue;
      }
      results.push({ success: true, ...(await executeOccurrence(template, runId)) });
    } catch (runError) {
      await markRunFailed(runId, runError);
      results.push({
        success: false,
        template_id: template?.id || null,
        run_id: runId,
        error: runError?.message || "Recurring Journal execution failed",
      });
    }
  }

  return {
    success: results.every(item => item.success),
    processed: results.length,
    completed: results.filter(item => item.success && !item.skipped).length,
    skipped: results.filter(item => item.skipped).length,
    failed: results.filter(item => !item.success).length,
    results,
  };
}
