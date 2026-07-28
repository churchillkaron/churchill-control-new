import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { loadLedgerAccountBalances } from "@/lib/finance/reporting/reports/loadLedgerAccountBalances";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function dateOnly(value, field) {
  const normalized = required(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${field} must be a valid date`);
  }
  return normalized;
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysInclusive(start, end) {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  return Math.floor((endMs - startMs) / 86400000) + 1;
}

export default async function buildRevenueForecast({
  organizationId,
  entityId,
  periodId = null,
  sourceStartDate = null,
  sourceEndDate = null,
  horizonDays = 30,
  growthRatePercent = 0,
  currencyCode = null,
  idempotencyKey = null,
  createdBy = null,
}) {
  const organization_id = required(organizationId, "organization_id");
  const entity_id = required(entityId, "entity_id");
  const entity = await resolveEntity({ organizationId: organization_id, entityId: entity_id });
  if (!entity) throw new Error("Legal entity not found in organisation");

  let period = null;
  if (periodId) {
    const { data, error } = await supabaseAdmin
      .from("accounting_periods")
      .select("id, organization_id, entity_id, name, start_date, end_date")
      .eq("organization_id", organization_id)
      .eq("entity_id", entity.id)
      .eq("id", periodId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Accounting period not found in selected legal entity");
    period = data;
  }

  const source_start_date = dateOnly(
    sourceStartDate || period?.start_date,
    "source_start_date"
  );
  const source_end_date = dateOnly(
    sourceEndDate || period?.end_date,
    "source_end_date"
  );
  if (source_start_date > source_end_date) {
    throw new Error("source_start_date cannot be after source_end_date");
  }

  const horizon_days = Number(horizonDays);
  if (!Number.isInteger(horizon_days) || horizon_days < 1 || horizon_days > 366) {
    throw new Error("horizon_days must be between 1 and 366");
  }

  const growth_rate_percent = Number(growthRatePercent || 0);
  if (!Number.isFinite(growth_rate_percent) || growth_rate_percent < -100 || growth_rate_percent > 1000) {
    throw new Error("growth_rate_percent must be between -100 and 1000");
  }

  const ledger = await loadLedgerAccountBalances({
    organizationId: organization_id,
    entityId: entity.id,
    startDate: source_start_date,
    endDate: source_end_date,
  });
  const sourceRevenue = (ledger.rows || [])
    .filter(row => row.classification === "revenue")
    .reduce((total, row) => total + Number(row.amount || 0), 0);
  const sourceDays = daysInclusive(source_start_date, source_end_date);
  const averageDailyRevenue = sourceDays > 0 ? sourceRevenue / sourceDays : 0;
  const projectedAmount = averageDailyRevenue * horizon_days * (1 + growth_rate_percent / 100);
  const target_start_date = addDays(source_end_date, 1);
  const target_end_date = addDays(target_start_date, horizon_days - 1);
  const currency_code = String(currencyCode || entity.currency || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency_code)) {
    throw new Error("currency_code must be configured for the selected legal entity");
  }

  const key = String(idempotencyKey || "").trim() || null;
  if (key) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("accounting_forecasts")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("entity_id", entity.id)
      .eq("idempotency_key", key)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return { success: true, forecast: existing, unchanged: true };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("accounting_forecasts")
    .insert({
      organization_id,
      entity_id: entity.id,
      period_id: period?.id || null,
      forecast_type: "REVENUE",
      forecast_period: `${target_start_date}:${target_end_date}`,
      source_start_date,
      source_end_date,
      target_start_date,
      target_end_date,
      horizon_days,
      growth_rate_percent,
      projected_amount: Number(projectedAmount.toFixed(6)),
      currency_code,
      method: "POSTED_LEDGER_DAILY_RUN_RATE",
      inputs_json: {
        source_revenue: Number(sourceRevenue.toFixed(6)),
        source_days: sourceDays,
        average_daily_revenue: Number(averageDailyRevenue.toFixed(6)),
      },
      status: "GENERATED",
      idempotency_key: key,
      created_by: createdBy || null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) throw error;

  return {
    success: true,
    forecast: data,
    source: {
      revenue: Number(sourceRevenue.toFixed(2)),
      days: sourceDays,
      average_daily_revenue: Number(averageDailyRevenue.toFixed(2)),
    },
  };
}
