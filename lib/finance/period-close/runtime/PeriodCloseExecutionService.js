import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { prepareAccountingEventJournal } from "@/lib/finance/general-ledger/workflows/prepareAccountingEventJournal";

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} required`);
  }

  return normalized;
}

function positiveNumber(value, field) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${field} must be positive`);
  }

  return number;
}

function uuidOrNull(value) {
  const normalized = String(value || "").trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

export async function loadPeriodCloseContext({
  organizationId,
  entityId,
  periodId,
}) {
  const resolvedOrganizationId = required(
    organizationId,
    "organizationId"
  );
  const resolvedEntityId = required(entityId, "entityId");
  const resolvedPeriodId = required(periodId, "periodId");

  const { data: period, error } = await supabaseAdmin
    .from("accounting_periods")
    .select(`
      id,
      organization_id,
      entity_id,
      period_name,
      start_date,
      end_date,
      status
    `)
    .eq("id", resolvedPeriodId)
    .eq("organization_id", resolvedOrganizationId)
    .eq("entity_id", resolvedEntityId)
    .single();

  if (error || !period) {
    throw new Error(
      "Accounting period is outside organization or entity scope"
    );
  }

  if (["closed", "locked"].includes(String(period.status || "").toLowerCase())) {
    throw new Error("Accounting period is already closed or locked");
  }

  const { data: entity, error: entityError } = await supabaseAdmin
    .from("legal_entities")
    .select("id, organization_id, currency")
    .eq("id", resolvedEntityId)
    .eq("organization_id", resolvedOrganizationId)
    .single();

  if (entityError || !entity) {
    throw new Error("Entity is outside organization scope");
  }

  return {
    organizationId: resolvedOrganizationId,
    entityId: resolvedEntityId,
    periodId: resolvedPeriodId,
    period,
    currencyCode: String(entity.currency || "").trim().toUpperCase() || null,
  };
}

export async function recordPeriodCloseStep({
  organizationId,
  entityId,
  periodId,
  stepType,
  status,
  evidence = {},
  completedBy = null,
  idempotencyKey,
}) {
  await loadPeriodCloseContext({
    organizationId,
    entityId,
    periodId,
  });

  const { data, error } = await supabaseAdmin.rpc(
    "finance_record_period_close_step_atomic",
    {
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_period_id: periodId,
      p_step_type: required(stepType, "stepType"),
      p_status: required(status, "status"),
      p_evidence: evidence || {},
      p_completed_by: uuidOrNull(completedBy),
      p_idempotency_key: required(
        idempotencyKey,
        "idempotencyKey"
      ),
    }
  );

  if (error) {
    throw new Error(`Period close step failed: ${error.message}`);
  }

  return data;
}

export async function postPeriodAdjustment({
  organizationId,
  entityId,
  periodId,
  stepType,
  sourceId = null,
  description,
  amount,
  taxAmount = 0,
  currencyCode = null,
  exchangeRate = 1,
  eventType,
  evidence = {},
  createdBy = null,
  idempotencyKey,
  journalLines = null,
}) {
  const context = await loadPeriodCloseContext({
    organizationId,
    entityId,
    periodId,
  });
  const resolvedCurrency = String(
    currencyCode || context.currencyCode || ""
  )
    .trim()
    .toUpperCase();
  const resolvedAmount = positiveNumber(amount, "amount");
  const resolvedExchangeRate = positiveNumber(
    exchangeRate,
    "exchangeRate"
  );
  const adjustmentId = uuidOrNull(sourceId) || randomUUID();
  let resolvedJournalLines = journalLines;

  if (!Array.isArray(resolvedJournalLines) || resolvedJournalLines.length < 2) {
    const journal = await prepareAccountingEventJournal({
      event: {
        organization_id: context.organizationId,
        entity_id: context.entityId,
        event_type: required(eventType, "eventType"),
        source_module: "period_close",
        source_id: adjustmentId,
        payload: {
          organization_id: context.organizationId,
          entity_id: context.entityId,
          source_document_id: adjustmentId,
          amount: resolvedAmount,
          taxAmount: Number(taxAmount || 0),
          currency_code: required(
            resolvedCurrency,
            "currencyCode"
          ),
          exchange_rate: resolvedExchangeRate,
          entryDate: context.period.end_date,
          description: description || stepType,
        },
      },
    });

    resolvedJournalLines = journal.lines;
  }

  const { data, error } = await supabaseAdmin.rpc(
    "finance_post_period_adjustment_atomic",
    {
      p_organization_id: context.organizationId,
      p_entity_id: context.entityId,
      p_period_id: context.periodId,
      p_step_type: required(stepType, "stepType"),
      p_source_id: adjustmentId,
      p_description: description || stepType,
      p_currency_code: resolvedCurrency,
      p_exchange_rate: resolvedExchangeRate,
      p_journal_lines: resolvedJournalLines,
      p_evidence: evidence || {},
      p_created_by: uuidOrNull(createdBy),
      p_idempotency_key: required(
        idempotencyKey,
        "idempotencyKey"
      ),
    }
  );

  if (error) {
    throw new Error(`Period adjustment failed: ${error.message}`);
  }

  return data;
}

export async function closeAccountingPeriod({
  organizationId,
  entityId,
  periodId,
  closeType = "MONTH_END",
  requiredSteps = [],
  closedBy = null,
  idempotencyKey,
}) {
  await loadPeriodCloseContext({
    organizationId,
    entityId,
    periodId,
  });

  const { data, error } = await supabaseAdmin.rpc(
    "finance_close_period_atomic",
    {
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_period_id: periodId,
      p_close_type: closeType,
      p_required_steps: Array.isArray(requiredSteps)
        ? requiredSteps
        : [],
      p_closed_by: uuidOrNull(closedBy),
      p_idempotency_key: required(
        idempotencyKey,
        "idempotencyKey"
      ),
    }
  );

  if (error) {
    throw new Error(`Period close failed: ${error.message}`);
  }

  return data;
}
