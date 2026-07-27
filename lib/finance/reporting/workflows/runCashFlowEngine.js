import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function signedAmount(row) {
  const amount = Number(row?.amount || 0);
  const direction = String(row?.direction || "").toUpperCase();
  return direction === "OUTFLOW" || direction === "DEBIT"
    ? -amount
    : amount;
}

export default async function runCashFlowEngine({
  organizationId,
  entityId,
  periodId,
}) {
  const organization = required(organizationId, "organizationId");
  const entity = required(entityId, "entityId");
  const period = required(periodId, "periodId");

  const { data: accountingPeriod, error: periodError } = await supabaseAdmin
    .from("accounting_periods")
    .select("id, start_date, end_date, status")
    .eq("organization_id", organization)
    .eq("entity_id", entity)
    .eq("id", period)
    .maybeSingle();

  if (periodError) throw periodError;
  if (!accountingPeriod) {
    throw new Error("Accounting period not found in organization and entity scope");
  }

  const startAt = `${accountingPeriod.start_date}T00:00:00.000Z`;
  const endAt = `${accountingPeriod.end_date}T23:59:59.999Z`;

  const { data: ledgerRows, error: ledgerError } = await supabaseAdmin
    .from("bank_ledger")
    .select("amount, direction, currency_code, created_at")
    .eq("organization_id", organization)
    .eq("entity_id", entity)
    .gte("created_at", startAt)
    .lte("created_at", endAt);

  if (ledgerError) throw ledgerError;

  let inflow = 0;
  let outflow = 0;

  for (const row of ledgerRows || []) {
    const signed = signedAmount(row);
    if (signed >= 0) inflow += signed;
    else outflow += Math.abs(signed);
  }

  const net = inflow - outflow;

  const { data: priorRows, error: priorError } = await supabaseAdmin
    .from("bank_ledger")
    .select("amount, direction")
    .eq("organization_id", organization)
    .eq("entity_id", entity)
    .lte("created_at", endAt);

  if (priorError) throw priorError;

  const cashPosition = (priorRows || []).reduce(
    (sum, row) => sum + signedAmount(row),
    0
  );

  const { data, error } = await supabaseAdmin
    .from("cash_flow_snapshots")
    .insert({
      organization_id: organization,
      entity_id: entity,
      inflow,
      outflow,
      net_cash_flow: net,
      cash_position: cashPosition,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    ...data,
    period_id: accountingPeriod.id,
    period_start: accountingPeriod.start_date,
    period_end: accountingPeriod.end_date,
    transaction_count: (ledgerRows || []).length,
  };
}
