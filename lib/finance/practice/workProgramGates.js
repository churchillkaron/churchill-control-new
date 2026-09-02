import { run as runReport } from "@/lib/finance/reporting/runtime/ReportingApplicationService";
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

function systemVerification(item) {
  const value = item?.metadata?.system_verification;
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

async function resolveEntity(run) {
  const explicit = run?.entity_id || run?.metadata?.entity_id || run?.metadata?.entityId || null;
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

async function documentsGate(run, item, entityId) {
  if (!run.period_id) return result({ satisfied: false, blockers: ["A financial period must be bound before document completeness can be verified"], entityId });
  const config = systemVerification(item);
  const categories = Array.isArray(config?.categories) ? config.categories : [];
  if (config?.mode !== "DOCUMENT_CATEGORIES" || !categories.length) {
    return result({ satisfied: false, blockers: ["Document completeness verification is not configured for this work item"], entityId });
  }

  const acceptedStatuses = Array.isArray(config.accepted_link_statuses) && config.accepted_link_statuses.length
    ? config.accepted_link_statuses.map((value) => String(value).toUpperCase())
    : ["ACTIVE"];
  const { data: links, error } = await supabaseAdmin
    .from("accounting_work_program_evidence_links")
    .select("id,document_id,evidence_category,status,is_primary,linked_at")
    .eq("accounting_firm_id", run.accounting_firm_id)
    .eq("organization_id", run.organization_id)
    .eq("entity_id", entityId)
    .eq("period_id", run.period_id)
    .eq("run_id", run.id)
    .eq("work_item_id", item.id)
    .in("status", acceptedStatuses);
  if (error) throw error;

  const activeLinks = links || [];
  const documentIds = [...new Set(activeLinks.map((row) => row.document_id).filter(Boolean))];
  const { data: documents, error: documentError } = documentIds.length
    ? await supabaseAdmin
        .from("organization_documents")
        .select("id,file_name,status,approval_required,approved_at,updated_at")
        .eq("organization_id", run.organization_id)
        .in("id", documentIds)
    : { data: [], error: null };
  if (documentError) throw documentError;
  const existingDocumentIds = new Set((documents || []).map((row) => row.id));
  const validLinks = activeLinks.filter((row) => existingDocumentIds.has(row.document_id));

  const blockers = [];
  const categoryEvidence = categories.map((category) => {
    const key = String(category?.key || "").trim().toLowerCase();
    const label = String(category?.label || key || "Evidence category").trim();
    const minCount = Math.max(1, Number(category?.min_count || 1));
    const matched = validLinks.filter((row) => String(row.evidence_category || "").trim().toLowerCase() === key);
    if (!key) blockers.push("A configured document evidence category is missing its key");
    else if (matched.length < minCount) blockers.push(`${label}: ${matched.length}/${minCount} linked`);
    return {
      key,
      label,
      min_count: minCount,
      count: matched.length,
      document_ids: matched.map((row) => row.document_id),
      evidence_link_ids: matched.map((row) => row.id),
    };
  });

  return result({
    satisfied: blockers.length === 0,
    blockers,
    evidence: [{ type: "document_categories", categories: categoryEvidence, linked_documents: documents || [] }],
    entityId,
  });
}

function reportEvidence(reportName, report) {
  if (reportName === "trial_balance") {
    return {
      type: "financial_report",
      report_type: "trial_balance",
      generated: report?.success === true,
      account_count: Number(report?.accountCount || 0),
      total_debits: Number(report?.totalDebits || 0),
      total_credits: Number(report?.totalCredits || 0),
      difference: Number(report?.difference || 0),
      balanced: report?.balanced === true,
    };
  }
  return {
    type: "financial_report",
    report_type: reportName,
    generated: report?.success === true,
    has_document: Boolean(report?.document),
  };
}

async function statementsGate(run, item, entityId) {
  if (!run.period_id) return result({ satisfied: false, blockers: ["A financial period must be bound before financial statements can be verified"], entityId });
  const config = systemVerification(item);
  const reports = Array.isArray(config?.reports) ? config.reports.map((value) => String(value).trim()).filter(Boolean) : [];
  if (config?.mode !== "FINANCIAL_REPORT_SET" || !reports.length) {
    return result({ satisfied: false, blockers: ["Financial statement verification is not configured for this work item"], entityId });
  }

  const blockers = [];
  const evidence = [];
  for (const reportName of reports) {
    try {
      const report = await runReport(reportName, {
        organizationId: run.organization_id,
        entityId,
        periodId: run.period_id,
      });
      const summary = reportEvidence(reportName, report);
      evidence.push(summary);
      if (report?.success !== true) blockers.push(`${reportName} did not generate successfully`);
      if (reportName === "trial_balance" && config.require_balanced_trial_balance === true && report?.balanced !== true) {
        blockers.push(`Trial balance is not balanced; difference ${Number(report?.difference || 0)}`);
      }
      if (reportName !== "trial_balance" && !report?.document) blockers.push(`${reportName} did not produce a report document`);
    } catch (error) {
      blockers.push(`${reportName} generation failed: ${error?.message || "unknown error"}`);
      evidence.push({ type: "financial_report", report_type: reportName, generated: false, error: error?.message || "unknown error" });
    }
  }

  return result({ satisfied: blockers.length === 0, blockers, evidence, entityId });
}

async function auditTrailGate(run, item, entityId) {
  const config = systemVerification(item);
  if (config?.mode !== "DEPENDENCY_AUDIT_CHAIN") {
    return result({ satisfied: false, blockers: ["Audit-trail verification is not configured for this work item"], entityId });
  }
  const dependencyKeys = Array.isArray(item.dependency_step_keys) ? item.dependency_step_keys.filter(Boolean) : [];
  if (!dependencyKeys.length) {
    return result({
      satisfied: true,
      evidence: [{ type: "dependency_audit_chain", dependency_count: 0, audited_dependencies: 0, conclusion: "No prior dependency audit chain is required" }],
      entityId,
    });
  }

  const { data: dependencies, error: dependencyError } = await supabaseAdmin
    .from("accounting_engagement_work_items")
    .select("id,step_key,title,status,completed_at")
    .eq("accounting_firm_id", run.accounting_firm_id)
    .eq("run_id", run.id)
    .in("step_key", dependencyKeys);
  if (dependencyError) throw dependencyError;
  const dependencyRows = dependencies || [];
  const byStep = new Map(dependencyRows.map((row) => [row.step_key, row]));
  const missingDependencies = dependencyKeys.filter((key) => !byStep.has(key));
  const dependencyIds = dependencyRows.map((row) => String(row.id));
  const { data: audits, error: auditError } = dependencyIds.length
    ? await supabaseAdmin
        .from("organization_audit_logs")
        .select("id,entity_id,action,created_at")
        .eq("organization_id", run.accounting_firm_id)
        .eq("entity_type", "accounting_engagement_work_item")
        .in("entity_id", dependencyIds)
        .in("action", ["ACCOUNTING_WORK_ITEM_COMPLETED"])
    : { data: [], error: null };
  if (auditError) throw auditError;
  const auditByEntity = new Map((audits || []).map((row) => [String(row.entity_id), row]));
  const blockers = missingDependencies.map((key) => `Dependency ${key} is missing from this run`);
  for (const dependency of dependencyRows) {
    if (!auditByEntity.has(String(dependency.id))) blockers.push(`${dependency.title || dependency.step_key} has no completion audit event`);
  }

  return result({
    satisfied: blockers.length === 0,
    blockers,
    evidence: [{
      type: "dependency_audit_chain",
      dependency_count: dependencyKeys.length,
      audited_dependencies: dependencyRows.filter((row) => auditByEntity.has(String(row.id))).length,
      dependencies: dependencyRows.map((row) => ({
        id: row.id,
        step_key: row.step_key,
        status: row.status,
        completed_at: row.completed_at,
        audit_log_id: auditByEntity.get(String(row.id))?.id || null,
      })),
    }],
    entityId,
  });
}

export async function evaluateWorkProgramGate({ run, item }) {
  const capability = String(item?.capability_id || "").trim();
  if (!capability) {
    return result({ applicable: false, satisfied: true, evidence: [{ type: "human_evidence", capability_id: null }] });
  }

  const { entityId, blocker } = await resolveEntity(run);
  if (!entityId) return result({ satisfied: false, blockers: [blocker], entityId: null });

  if (capability === "documents") return documentsGate(run, item, entityId);
  if (capability === "statements") return statementsGate(run, item, entityId);
  if (capability === "audit_trail") return auditTrailGate(run, item, entityId);
  if (capability === "bank_reconciliation") return bankReconciliationGate(run, entityId);
  if (capability === "journals") return journalsGate(run, entityId);
  if (capability === "statutory_filings") return statutoryGate(run, entityId);
  if (capability === "close") return closeGate(run, entityId);
  return result({ applicable: false, satisfied: true, entityId, evidence: [{ type: "unsupported_system_gate", capability_id: capability }] });
}
