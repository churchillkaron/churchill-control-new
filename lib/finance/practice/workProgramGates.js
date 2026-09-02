import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function result({ applicable = true, satisfied, blockers = [], evidence = [], entityId = null }) {
  return {
    applicable,
    satisfied: applicable ? Boolean(satisfied) : true,
    blockers,
    evidence,
    entity_id: entityId,
    checked_at: new Date().toISOString(),
  };
}

async function resolveEntity(run) {
  const explicit = run?.metadata?.entity_id || run?.metadata?.entityId || null;
  if (explicit) return { entityId: explicit, blocker: null };

  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("id")
    .eq("organization_id", run.organization_id)
    .limit(3);
  if (error) throw error;
  if ((data || []).length === 1) return { entityId: data[0].id, blocker: null };
  if (!(data || []).length) return { entityId: null, blocker: "No legal entity exists for the client organization" };
  return { entityId: null, blocker: "Multiple legal entities exist; bind the work program run to an entity before system verification" };
}

async function bankReconciliationGate(run, entityId) {
  const { data: accounts, error: accountsError } = await supabaseAdmin
    .from("bank_accounts")
    .select("id,bank_name,account_name")
    .eq("organization_id", run.organization_id)
    .eq("entity_id", entityId)
    .eq("active", true);
  if (accountsError) throw accountsError;
  if (!(accounts || []).length) {
    return result({ satisfied: true, entityId, evidence: [{ type: "bank_accounts", count: 0, conclusion: "No active bank accounts require reconciliation" }] });
  }

  let query = supabaseAdmin
    .from("finance_bank_reconciliation_runs")
    .select("id,bank_account_id,reconciliation_date,difference_amount,status,updated_at")
    .eq("organization_id", run.organization_id)
    .eq("entity_id", entityId)
    .in("bank_account_id", accounts.map((row) => row.id))
    .order("reconciliation_date", { ascending: false });
  if (run.start_at) query = query.gte("reconciliation_date", String(run.start_at).slice(0, 10));
  if (run.due_at) query = query.lte("reconciliation_date", String(run.due_at).slice(0, 10));
  const { data: reconciliations, error } = await query;
  if (error) throw error;

  const latest = new Map();
  for (const row of reconciliations || []) if (!latest.has(row.bank_account_id)) latest.set(row.bank_account_id, row);
  const blockers = [];
  const evidence = [];
  for (const account of accounts || []) {
    const row = latest.get(account.id);
    if (!row) {
      blockers.push(`No reconciliation exists for ${account.account_name || account.bank_name || account.id}`);
      continue;
    }
    const difference = Math.abs(Number(row.difference_amount || 0));
    const status = String(row.status || "").toUpperCase();
    evidence.push({ type: "bank_reconciliation", bank_account_id: account.id, reconciliation_id: row.id, reconciliation_date: row.reconciliation_date, difference_amount: difference, status });
    if (difference > 0.01) blockers.push(`${account.account_name || account.bank_name || account.id} has an unreconciled difference of ${difference}`);
    if (!["RECONCILED", "COMPLETE", "COMPLETED", "APPROVED", "CLOSED"].includes(status)) blockers.push(`${account.account_name || account.bank_name || account.id} reconciliation is ${status || "not finalized"}`);
  }
  return result({ satisfied: blockers.length === 0, blockers, evidence, entityId });
}

async function journalsGate(run, entityId) {
  let query = supabaseAdmin
    .from("journal_entries")
    .select("id,journal_number,entry_date,status,approved_at,posting_date,period_id,reversed")
    .eq("organization_id", run.organization_id)
    .eq("entity_id", entityId);
  if (run.period_id) query = query.eq("period_id", run.period_id);
  const { data, error } = await query;
  if (error) throw error;
  const journals = data || [];
  const blockers = journals
    .filter((row) => !["POSTED"].includes(String(row.status || "").toUpperCase()) || row.reversed === true)
    .map((row) => `${row.journal_number || row.id} is ${row.reversed ? "reversed" : row.status || "not posted"}`);
  return result({
    satisfied: blockers.length === 0,
    blockers,
    evidence: [{ type: "journals", count: journals.length, posted: journals.length - blockers.length, period_id: run.period_id || null }],
    entityId,
  });
}

async function statutoryGate(run, entityId) {
  const [engagementResult, filingsResult, vatResult] = await Promise.all([
    supabaseAdmin.from("accounting_engagements").select("vat_enabled,tax_enabled").eq("id", run.engagement_id).maybeSingle(),
    run.period_id
      ? supabaseAdmin.from("finance_statutory_filings").select("id,filing_type,status,due_date,submitted_at,submission_reference").eq("organization_id", run.organization_id).eq("entity_id", entityId).eq("period_id", run.period_id)
      : Promise.resolve({ data: [], error: null }),
    run.period_id
      ? supabaseAdmin.from("finance_vat_returns").select("id,status,filing_due_date,submitted_at,submission_reference").eq("organization_id", run.organization_id).eq("entity_id", entityId).eq("period_id", run.period_id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (engagementResult.error) throw engagementResult.error;
  if (filingsResult.error) throw filingsResult.error;
  if (vatResult.error) throw vatResult.error;

  const engagement = engagementResult.data || {};
  const filings = filingsResult.data || [];
  const vatReturns = vatResult.data || [];
  const blockers = [];
  const cleared = new Set(["SUBMITTED", "ACCEPTED", "APPROVED", "FILED", "COMPLETE", "COMPLETED"]);

  if ((engagement.tax_enabled || engagement.vat_enabled) && !run.period_id) blockers.push("A period must be bound to the run before statutory verification");
  if (engagement.tax_enabled && !filings.length) blockers.push("Tax/statutory service is enabled but no statutory filing evidence exists for the period");
  if (engagement.vat_enabled && !vatReturns.length) blockers.push("VAT service is enabled but no VAT return exists for the period");
  for (const filing of filings) if (!cleared.has(String(filing.status || "").toUpperCase())) blockers.push(`${filing.filing_type || filing.id} is ${filing.status || "not finalized"}`);
  for (const vat of vatReturns) if (!cleared.has(String(vat.status || "").toUpperCase())) blockers.push(`VAT return ${vat.id} is ${vat.status || "not finalized"}`);

  return result({
    satisfied: blockers.length === 0,
    blockers,
    evidence: [
      { type: "statutory_filings", count: filings.length, records: filings.map((row) => ({ id: row.id, status: row.status, submitted_at: row.submitted_at, submission_reference: row.submission_reference })) },
      { type: "vat_returns", count: vatReturns.length, records: vatReturns.map((row) => ({ id: row.id, status: row.status, submitted_at: row.submitted_at, submission_reference: row.submission_reference })) },
    ],
    entityId,
  });
}

async function closeGate(run, entityId) {
  if (!run.period_id) return result({ satisfied: false, blockers: ["A financial period must be bound before close verification"], entityId });
  const { data, error } = await supabaseAdmin
    .from("financial_periods")
    .select("id,status,closed_at,closed_by")
    .eq("id", run.period_id)
    .eq("organization_id", run.organization_id)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (error) throw error;
  const closed = data && ["CLOSED", "LOCKED", "FINAL"].includes(String(data.status || "").toUpperCase()) && Boolean(data.closed_at);
  return result({
    satisfied: closed,
    blockers: closed ? [] : ["Financial period is not closed and locked"],
    evidence: data ? [{ type: "financial_period", id: data.id, status: data.status, closed_at: data.closed_at, closed_by: data.closed_by }] : [],
    entityId,
  });
}

export async function evaluateWorkProgramGate({ run, item }) {
  const capability = String(item?.capability_id || "").trim();
  if (!capability || ["documents", "statements", "audit_trail"].includes(capability)) {
    return result({ applicable: false, satisfied: true, evidence: [{ type: "human_evidence", capability_id: capability || null }] });
  }

  const { entityId, blocker } = await resolveEntity(run);
  if (!entityId) return result({ satisfied: false, blockers: [blocker], entityId: null });

  if (capability === "bank_reconciliation") return bankReconciliationGate(run, entityId);
  if (capability === "journals") return journalsGate(run, entityId);
  if (capability === "statutory_filings") return statutoryGate(run, entityId);
  if (capability === "close") return closeGate(run, entityId);
  return result({ applicable: false, satisfied: true, entityId, evidence: [{ type: "unsupported_system_gate", capability_id: capability }] });
}
