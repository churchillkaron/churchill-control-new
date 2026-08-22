import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { financeGateway } from "@/lib/finance/runtime/financeGateway";

const FREQUENCIES = new Set(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]);

function pad(value) {
  return String(value).padStart(2, "0");
}

function isoDate(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
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

  const completedAt = new Date().toISOString();
  const calculatedNextDate = nextRunDate(scheduledDate, template.frequency);
  const hasEnded = Boolean(template.end_date && calculatedNextDate > template.end_date);

  const { error: runUpdateError } = await supabaseAdmin
    .from("finance_recurring_journal_runs")
    .update({
      status: "COMPLETED",
      journal_entry_id: journalEntryId,
      error_message: null,
      completed_at: completedAt,
      next_retry_at: null,
      updated_at: completedAt,
    })
    .eq("id", runId)
    .eq("status", "CLAIMED");
  if (runUpdateError) throw runUpdateError;

  const { error: templateUpdateError } = await supabaseAdmin
    .from("finance_recurring_journal_templates")
    .update({
      last_run_at: completedAt,
      last_journal_entry_id: journalEntryId,
      next_run_date: calculatedNextDate,
      status: hasEnded ? "INACTIVE" : "ACTIVE",
      updated_at: completedAt,
    })
    .eq("organization_id", template.organization_id)
    .eq("entity_id", template.entity_id)
    .eq("id", template.id)
    .eq("next_run_date", scheduledDate);
  if (templateUpdateError) throw templateUpdateError;

  return {
    run_id: runId,
    template_id: template.id,
    scheduled_date: scheduledDate,
    journal_entry_id: journalEntryId,
    next_run_date: calculatedNextDate,
    completed: hasEnded,
    idempotent: Boolean(posting?.ledger?.idempotentReplay),
  };
}

export async function processDueRecurringJournals({ limit = 25 } = {}) {
  const today = isoDate(new Date());
  const { data: templates, error } = await supabaseAdmin
    .from("finance_recurring_journal_templates")
    .select("id, organization_id, entity_id, name, reference, frequency, next_run_date, end_date, currency_code, exchange_rate, description, lines, status")
    .eq("status", "ACTIVE")
    .lte("next_run_date", today)
    .order("next_run_date", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 25, 100)));

  if (error) throw error;

  const results = [];
  for (const template of templates || []) {
    let runId = null;
    try {
      validateTemplate(template);
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
