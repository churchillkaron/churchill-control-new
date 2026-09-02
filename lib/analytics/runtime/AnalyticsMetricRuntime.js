import { ANALYTICS_METRIC_BY_ID } from "@/lib/analytics/semantic/AnalyticsMetricCatalog";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TERMINAL = new Set(["complete", "completed", "closed", "cancelled", "canceled", "rejected", "void", "voided", "done", "archived"]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function number(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function terminal(value) {
  return TERMINAL.has(normalized(value));
}

function applyEntity(query, entityId) {
  return entityId ? query.eq("entity_id", entityId) : query;
}

function latest(rows, fields = ["updated_at", "created_at"]) {
  let winner = null;
  for (const row of rows || []) {
    for (const field of fields) {
      const value = row?.[field];
      if (!value) continue;
      const time = new Date(value).getTime();
      if (Number.isFinite(time) && (!winner || time > winner.time)) winner = { time, value };
    }
  }
  return winner?.value || null;
}

function money(rows, amountField, currencyField, fallbackCurrency = null) {
  const totals = new Map();
  for (const row of rows || []) {
    const code = clean(row?.[currencyField] || fallbackCurrency || "UNSPECIFIED").toUpperCase();
    totals.set(code, (totals.get(code) || 0) + number(row?.[amountField]));
  }
  const valuesByCurrency = [...totals.entries()].map(([currency, value]) => ({ currency, value })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const preferred = clean(fallbackCurrency).toUpperCase();
  const preferredRow = valuesByCurrency.find((entry) => entry.currency === preferred);
  return {
    value: valuesByCurrency.length === 1 ? valuesByCurrency[0].value : preferredRow?.value ?? null,
    currency: valuesByCurrency.length === 1 ? valuesByCurrency[0].currency : preferredRow?.currency || null,
    valuesByCurrency,
    mixedCurrency: valuesByCurrency.length > 1,
  };
}

async function rows(table, select, organizationId, entityId, mutate = null) {
  let query = supabaseAdmin.from(table).select(select).eq("organization_id", organizationId);
  query = applyEntity(query, entityId);
  if (mutate) query = mutate(query);
  const { data, error } = await query.limit(10000);
  if (error) throw error;
  return data || [];
}

export async function computeAnalyticsMetric({ organizationId, entityId = null, currency = null, metricId, now = new Date() }) {
  const definition = ANALYTICS_METRIC_BY_ID[metricId];
  if (!definition) throw new Error(`Unknown Analytics metric: ${metricId}`);

  if (metricId === "finance.ar.outstanding") {
    const data = await rows("customer_invoices", "id,outstanding_amount,outstanding_balance,status,currency_code,created_at,updated_at", organizationId, entityId);
    const open = data.map((row) => ({ ...row, __amount: number(row.outstanding_amount || row.outstanding_balance) })).filter((row) => row.__amount > 0 && !["cancelled", "canceled", "void", "voided"].includes(normalized(row.status)));
    return { ...definition, ...money(open, "__amount", "currency_code", currency), evidenceCount: open.length, watermark: latest(data) };
  }

  if (metricId === "finance.ap.outstanding") {
    const data = await rows("vendor_invoices", "id,outstanding_amount,status,currency_code,created_at,updated_at", organizationId, entityId);
    const open = data.filter((row) => number(row.outstanding_amount) > 0 && !terminal(row.status));
    return { ...definition, ...money(open, "outstanding_amount", "currency_code", currency), evidenceCount: open.length, watermark: latest(data) };
  }

  if (metricId === "commercial.orders.open_value") {
    const data = await rows("sales_orders", "id,status,remaining_balance,currency_code,created_at,updated_at", organizationId, entityId);
    const open = data.filter((row) => !terminal(row.status) && number(row.remaining_balance) > 0);
    return { ...definition, ...money(open, "remaining_balance", "currency_code", currency), evidenceCount: open.length, watermark: latest(data) };
  }

  if (metricId === "commercial.quotations.pipeline") {
    const data = await rows("commercial_quotations", "id,status,total_amount,currency_code,created_at,updated_at", organizationId, entityId);
    const open = data.filter((row) => !["converted", "rejected", "cancelled", "canceled", "closed", "expired"].includes(normalized(row.status)));
    return { ...definition, ...money(open, "total_amount", "currency_code", currency), evidenceCount: open.length, watermark: latest(data) };
  }

  if (metricId === "operations.work.open" || metricId === "operations.work.overdue") {
    const data = await rows("operations_records", "id,status,due_at,completed_at,created_at,updated_at", organizationId, entityId);
    const open = data.filter((row) => !terminal(row.status) && !row.completed_at);
    const selected = metricId.endsWith("overdue") ? open.filter((row) => row.due_at && new Date(row.due_at).getTime() < now.getTime()) : open;
    return { ...definition, value: selected.length, currency: null, valuesByCurrency: null, mixedCurrency: false, evidenceCount: selected.length, watermark: latest(data) };
  }

  if (metricId === "supply.inventory.value") {
    const data = await rows("inventory_valuation_snapshots", "id,item_id,snapshot_date,inventory_value,created_at", organizationId, entityId, (query) => query.order("snapshot_date", { ascending: false }));
    const latestByItem = new Map();
    for (const row of data) if (!latestByItem.has(row.item_id || row.id)) latestByItem.set(row.item_id || row.id, row);
    const evidence = [...latestByItem.values()];
    const value = evidence.reduce((total, row) => total + number(row.inventory_value), 0);
    return { ...definition, value, currency: currency || null, valuesByCurrency: currency ? [{ currency, value }] : null, mixedCurrency: false, evidenceCount: evidence.length, watermark: latest(data, ["snapshot_date", "created_at"]) };
  }

  if (metricId === "supply.inventory.alerts.open") {
    const data = await rows("inventory_alerts", "id,resolved,created_at,resolved_at", organizationId, entityId);
    const open = data.filter((row) => row.resolved !== true);
    return { ...definition, value: open.length, currency: null, valuesByCurrency: null, mixedCurrency: false, evidenceCount: open.length, watermark: latest(data, ["created_at", "resolved_at"]) };
  }

  if (metricId === "people.attendance.late_minutes_30d") {
    const trailing30 = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const data = await rows("staff_attendance", "id,shift_date,late_minutes,created_at", organizationId, entityId, (query) => query.gte("shift_date", trailing30));
    const value = data.reduce((total, row) => total + Math.max(0, number(row.late_minutes)), 0);
    return { ...definition, value, currency: null, valuesByCurrency: null, mixedCurrency: false, evidenceCount: data.length, watermark: latest(data, ["shift_date", "created_at"]) };
  }

  if (metricId === "projects.active") {
    const data = await rows("projects", "id,status,end_date,created_at,updated_at", organizationId, entityId);
    const today = now.toISOString().slice(0, 10);
    const active = data.filter((row) => !terminal(row.status) && (!row.end_date || String(row.end_date) >= today));
    return { ...definition, value: active.length, currency: null, valuesByCurrency: null, mixedCurrency: false, evidenceCount: active.length, watermark: latest(data) };
  }

  throw new Error(`Analytics metric runtime not implemented: ${metricId}`);
}

export default computeAnalyticsMetric;
