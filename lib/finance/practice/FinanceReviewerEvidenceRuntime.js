import { getFinanceEvidenceDocument } from "@/lib/finance/practice/FinanceEvidenceDocumentRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig;
const KNOWN_IDENTIFIER_KEYS = new Set([
  "id",
  "record_id",
  "reference_id",
  "source_id",
  "document_id",
  "journal_entry_id",
  "journal_id",
  "bank_reconciliation_run_id",
  "reconciliation_run_id",
  "filing_id",
  "close_run_id",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function amount(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return Math.round((amount(value) + Number.EPSILON) * 100) / 100;
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function unique(rows = [], key = "id") {
  const seen = new Set();
  return rows.filter((row) => {
    const value = row?.[key];
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function addUuid(candidateMap, value, basis) {
  const text = clean(value);
  if (!text) return;
  const matches = text.match(UUID_PATTERN) || [];
  for (const id of matches) {
    const normalized = id.toLowerCase();
    if (!candidateMap.has(normalized)) candidateMap.set(normalized, new Set());
    candidateMap.get(normalized).add(basis);
  }
}

function collectKnownIdentifiers(value, candidateMap, basis, depth = 0) {
  if (depth > 4 || value == null) return;
  if (Array.isArray(value)) {
    value.slice(0, 100).forEach((entry, index) =>
      collectKnownIdentifiers(entry, candidateMap, `${basis}[${index}]`, depth + 1),
    );
    return;
  }
  if (typeof value !== "object") return;

  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = clean(key).toLowerCase();
    if (KNOWN_IDENTIFIER_KEYS.has(normalizedKey)) {
      addUuid(candidateMap, entry, `${basis}.${normalizedKey}`);
    }
    if (entry && typeof entry === "object") {
      collectKnownIdentifiers(entry, candidateMap, `${basis}.${normalizedKey}`, depth + 1);
    }
  }
}

function movement(rows = []) {
  const totals = rows.reduce(
    (result, row) => ({
      debits: result.debits + amount(row?.debit),
      credits: result.credits + amount(row?.credit),
      lines: result.lines + 1,
    }),
    { debits: 0, credits: 0, lines: 0 },
  );
  return {
    debits: round(totals.debits),
    credits: round(totals.credits),
    net: round(totals.debits - totals.credits),
    lines: totals.lines,
  };
}

function byAccount(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!row?.account_id) continue;
    if (!map.has(row.account_id)) map.set(row.account_id, []);
    map.get(row.account_id).push(row);
  }
  return map;
}

async function loadPeriod(run) {
  if (!run?.period_id) return { current: null, previous: null, source: null };

  const [financialResult, accountingResult] = await Promise.all([
    supabaseAdmin
      .from("financial_periods")
      .select("id,organization_id,entity_id,period_name,start_date,end_date,status,closed_at")
      .eq("id", run.period_id)
      .eq("organization_id", run.organization_id)
      .maybeSingle(),
    supabaseAdmin
      .from("accounting_periods")
      .select("id,organization_id,entity_id,legal_entity_id,period_name,start_date,end_date,status,closed_at")
      .eq("id", run.period_id)
      .eq("organization_id", run.organization_id)
      .maybeSingle(),
  ]);
  if (financialResult.error) throw financialResult.error;
  if (accountingResult.error) throw accountingResult.error;

  const source = financialResult.data ? "financial_periods" : accountingResult.data ? "accounting_periods" : null;
  const current = financialResult.data || accountingResult.data || null;
  if (!source || !current?.start_date) return { current, previous: null, source };

  let previousQuery = supabaseAdmin
    .from(source)
    .select(source === "financial_periods"
      ? "id,organization_id,entity_id,period_name,start_date,end_date,status,closed_at"
      : "id,organization_id,entity_id,legal_entity_id,period_name,start_date,end_date,status,closed_at")
    .eq("organization_id", run.organization_id)
    .lt("end_date", current.start_date)
    .order("end_date", { ascending: false })
    .limit(1);

  if (source === "financial_periods" && run.entity_id) previousQuery = previousQuery.eq("entity_id", run.entity_id);
  if (source === "accounting_periods" && run.entity_id) previousQuery = previousQuery.eq("entity_id", run.entity_id);

  const { data: previousRows, error: previousError } = await previousQuery;
  if (previousError) throw previousError;
  return { current, previous: previousRows?.[0] || null, source };
}

async function loadPreviousWork(accountingFirmId, run, item) {
  if (!run?.engagement_id || !run?.template_id || !item?.step_key) return null;

  const { data: previousRuns, error: previousRunsError } = await supabaseAdmin
    .from("accounting_engagement_runs")
    .select("id,period_id,run_key,status,due_at,completed_at,created_at")
    .eq("accounting_firm_id", accountingFirmId)
    .eq("engagement_id", run.engagement_id)
    .eq("template_id", run.template_id)
    .neq("id", run.id)
    .lt("created_at", run.created_at)
    .order("created_at", { ascending: false })
    .limit(12);
  if (previousRunsError) throw previousRunsError;
  const runIds = (previousRuns || []).map((row) => row.id);
  if (!runIds.length) return null;

  const { data: previousItems, error: previousItemsError } = await supabaseAdmin
    .from("accounting_engagement_work_items")
    .select("id,run_id,title,status,conclusion,evidence,metadata,finance_review_item_id,completed_at,updated_at")
    .eq("accounting_firm_id", accountingFirmId)
    .eq("step_key", item.step_key)
    .in("run_id", runIds);
  if (previousItemsError) throw previousItemsError;

  const itemByRun = new Map((previousItems || []).map((row) => [row.run_id, row]));
  const previousRun = (previousRuns || []).find((row) => itemByRun.has(row.id)) || null;
  if (!previousRun) return null;
  const previousItem = itemByRun.get(previousRun.id);

  let review = null;
  if (previousItem.finance_review_item_id) {
    const { data, error } = await supabaseAdmin
      .from("finance_review_items")
      .select("id,status,priority,record_label,updated_at")
      .eq("id", previousItem.finance_review_item_id)
      .eq("organization_id", run.organization_id)
      .maybeSingle();
    if (error) throw error;
    review = data || null;
  }

  return {
    run: previousRun,
    work_item: previousItem,
    review,
  };
}

function applyLedgerPeriod(query, period, run) {
  if (period?.start_date) query = query.gte("posting_date", dateOnly(period.start_date));
  if (period?.end_date) query = query.lte("posting_date", dateOnly(period.end_date));
  if (!period?.start_date && !period?.end_date && run?.period_id) query = query.eq("period_id", run.period_id);
  return query;
}

async function loadJournalEntries(run, candidateIds) {
  if (!candidateIds.length) return [];
  const fields = "id,journal_number,entry_number,entry_date,posting_date,description,source_type,source_module,source_document,source_document_id,status,currency_code,reference,entity_id,legal_entity_id,period_id,approved_by,approved_at,reversed,reversal_status";
  const [directResult, documentResult] = await Promise.all([
    supabaseAdmin
      .from("journal_entries")
      .select(fields)
      .eq("organization_id", run.organization_id)
      .in("id", candidateIds)
      .limit(250),
    supabaseAdmin
      .from("journal_entries")
      .select(fields)
      .eq("organization_id", run.organization_id)
      .in("source_document_id", candidateIds)
      .limit(250),
  ]);
  if (directResult.error) throw directResult.error;
  if (documentResult.error) throw documentResult.error;

  return unique([...(directResult.data || []), ...(documentResult.data || [])])
    .filter((row) => !run.entity_id || row.entity_id === run.entity_id || row.legal_entity_id === run.entity_id);
}

async function loadExactLedgerLines(run, period, candidateIds, journalIds) {
  const queries = [];
  if (candidateIds.length) {
    let referenceQuery = supabaseAdmin
      .from("general_ledger")
      .select("id,account_id,journal_entry_id,reference_type,reference_id,description,debit,credit,currency_code,posting_date,period_id")
      .eq("organization_id", run.organization_id)
      .eq("entity_id", run.entity_id)
      .in("reference_id", candidateIds)
      .limit(5000);
    queries.push(applyLedgerPeriod(referenceQuery, period, run));
  }
  if (journalIds.length) {
    let journalQuery = supabaseAdmin
      .from("general_ledger")
      .select("id,account_id,journal_entry_id,reference_type,reference_id,description,debit,credit,currency_code,posting_date,period_id")
      .eq("organization_id", run.organization_id)
      .eq("entity_id", run.entity_id)
      .in("journal_entry_id", journalIds)
      .limit(5000);
    queries.push(applyLedgerPeriod(journalQuery, period, run));
  }
  if (!queries.length) return [];
  const results = await Promise.all(queries);
  results.forEach((result) => { if (result.error) throw result.error; });
  return unique(results.flatMap((result) => result.data || []));
}

async function loadPeriodMovement(run, period, accountIds) {
  if (!period?.start_date || !period?.end_date || !accountIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from("general_ledger")
    .select("account_id,debit,credit,posting_date")
    .eq("organization_id", run.organization_id)
    .eq("entity_id", run.entity_id)
    .in("account_id", accountIds)
    .gte("posting_date", dateOnly(period.start_date))
    .lte("posting_date", dateOnly(period.end_date))
    .limit(20000);
  if (error) throw error;
  return data || [];
}

async function loadAccountMetadata(run, accountIds) {
  if (!accountIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from("chart_of_accounts")
    .select("id,account_code,account_name,account_category,account_type,normal_balance,currency_code,entity_id")
    .eq("organization_id", run.organization_id)
    .in("id", accountIds);
  if (error) throw error;
  return data || [];
}

async function loadControlRecords(run, candidateIds) {
  if (!candidateIds.length) return { reconciliations: [], filings: [], close_runs: [] };
  const [reconciliationResult, filingResult, closeResult] = await Promise.all([
    supabaseAdmin
      .from("finance_bank_reconciliation_runs")
      .select("id,bank_account_id,bank_statement_id,reconciliation_date,book_closing_balance,statement_closing_balance,difference_amount,status,notes,created_at,updated_at")
      .eq("organization_id", run.organization_id)
      .eq("entity_id", run.entity_id)
      .in("id", candidateIds)
      .limit(100),
    supabaseAdmin
      .from("finance_statutory_filings")
      .select("id,filing_type,jurisdiction_code,authority_name,period_start,period_end,due_date,submission_reference,submitted_at,status,notes")
      .eq("organization_id", run.organization_id)
      .eq("entity_id", run.entity_id)
      .in("id", candidateIds)
      .limit(100),
    supabaseAdmin
      .from("finance_period_close_runs")
      .select("id,close_type,status,required_steps,result,closed_at,created_at,updated_at")
      .eq("organization_id", run.organization_id)
      .eq("entity_id", run.entity_id)
      .in("id", candidateIds)
      .limit(100),
  ]);
  for (const result of [reconciliationResult, filingResult, closeResult]) {
    if (result.error) throw result.error;
  }
  return {
    reconciliations: reconciliationResult.data || [],
    filings: filingResult.data || [],
    close_runs: closeResult.data || [],
  };
}

export async function buildFinanceReviewerEvidence({ accountingFirmId, runId, workItemId }) {
  const firmId = clean(accountingFirmId);
  const scopedRunId = clean(runId);
  const scopedWorkItemId = clean(workItemId);
  if (!firmId || !scopedRunId || !scopedWorkItemId) throw new Error("accountingFirmId, runId and workItemId are required");

  const [runResult, itemResult] = await Promise.all([
    supabaseAdmin
      .from("accounting_engagement_runs")
      .select("id,accounting_firm_id,organization_id,entity_id,engagement_id,template_id,period_id,run_key,status,start_at,due_at,completed_at,locked_at,created_at,updated_at")
      .eq("id", scopedRunId)
      .eq("accounting_firm_id", firmId)
      .maybeSingle(),
    supabaseAdmin
      .from("accounting_engagement_work_items")
      .select("id,accounting_firm_id,organization_id,entity_id,run_id,step_key,sequence_no,title,description,work_type,required_role,assigned_to,status,start_at,due_at,completed_at,blocked_reason,capability_id,finance_review_item_id,evidence,conclusion,metadata,budget_minutes,updated_at")
      .eq("id", scopedWorkItemId)
      .eq("accounting_firm_id", firmId)
      .eq("run_id", scopedRunId)
      .maybeSingle(),
  ]);
  if (runResult.error) throw runResult.error;
  if (itemResult.error) throw itemResult.error;
  const run = runResult.data;
  const item = itemResult.data;
  if (!run) throw new Error("Accounting engagement run not found for this firm");
  if (!item) throw new Error("Accounting work item not found for this firm");
  if (!run.organization_id || !run.entity_id || !run.period_id) throw new Error("Accounting run must have client organization, entity and period scope");
  if (item.organization_id && item.organization_id !== run.organization_id) throw new Error("Accounting work item client scope does not match its run");
  if (item.entity_id && item.entity_id !== run.entity_id) throw new Error("Accounting work item entity scope does not match its run");

  const [periodContext, evidenceLinksResult, previousWork] = await Promise.all([
    loadPeriod(run),
    supabaseAdmin
      .from("accounting_work_program_evidence_links")
      .select("id,document_id,evidence_category,status,is_primary,linked_by,linked_at,metadata,created_at,updated_at")
      .eq("accounting_firm_id", firmId)
      .eq("run_id", run.id)
      .eq("work_item_id", item.id)
      .order("linked_at", { ascending: false }),
    loadPreviousWork(firmId, run, item),
  ]);
  if (evidenceLinksResult.error) throw evidenceLinksResult.error;
  const evidenceLinks = evidenceLinksResult.data || [];

  let reviewItem = null;
  if (item.finance_review_item_id) {
    const { data, error } = await supabaseAdmin
      .from("finance_review_items")
      .select("id,organization_id,entity_id,period_id,capability_id,record_key,record_type,record_label,status,priority,preparer_id,reviewer_id,due_at,metadata,created_at,updated_at")
      .eq("id", item.finance_review_item_id)
      .eq("organization_id", run.organization_id)
      .maybeSingle();
    if (error) throw error;
    reviewItem = data || null;
  }

  const [documents, notesResult, signoffsResult] = await Promise.all([
    Promise.all(evidenceLinks.map(async (link) => ({
      ...link,
      document: await getFinanceEvidenceDocument({ organizationId: run.organization_id, documentId: link.document_id }),
    }))),
    reviewItem
      ? supabaseAdmin
          .from("finance_review_notes")
          .select("id,note_type,body,status,assigned_to,created_by,resolved_by,resolved_at,created_at,updated_at")
          .eq("organization_id", run.organization_id)
          .eq("review_item_id", reviewItem.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    reviewItem
      ? supabaseAdmin
          .from("finance_review_signoffs")
          .select("id,signoff_role,signed_by,signed_at,note,cycle_no,revoked_at,revoked_by,revocation_reason")
          .eq("organization_id", run.organization_id)
          .eq("review_item_id", reviewItem.id)
          .order("signed_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (notesResult.error) throw notesResult.error;
  if (signoffsResult.error) throw signoffsResult.error;

  const candidateMap = new Map();
  if (reviewItem?.record_key) addUuid(candidateMap, reviewItem.record_key, "review.record_key");
  collectKnownIdentifiers(item.evidence, candidateMap, "work_item.evidence");
  collectKnownIdentifiers(item.metadata?.system_gate?.evidence, candidateMap, "system_gate.evidence");
  collectKnownIdentifiers(item.metadata?.system_verification, candidateMap, "system_verification");
  for (const link of evidenceLinks) addUuid(candidateMap, link.document_id, "evidence_link.document_id");

  const documentIds = evidenceLinks.map((link) => link.document_id).filter(Boolean);
  if (documentIds.length) {
    const [legacyResult, controlledResult] = await Promise.all([
      supabaseAdmin
        .from("organization_documents")
        .select("id,destination_record_id,destination_module")
        .eq("organization_id", run.organization_id)
        .in("id", documentIds),
      supabaseAdmin
        .from("enterprise_documents")
        .select("id,metadata")
        .eq("organization_id", run.organization_id)
        .in("id", documentIds),
    ]);
    if (legacyResult.error) throw legacyResult.error;
    if (controlledResult.error) throw controlledResult.error;
    for (const row of legacyResult.data || []) {
      addUuid(candidateMap, row.destination_record_id, `organization_document.${clean(row.destination_module) || "destination"}`);
    }
    for (const row of controlledResult.data || []) {
      collectKnownIdentifiers(row.metadata, candidateMap, "enterprise_document.metadata");
    }
  }

  const candidateIds = [...candidateMap.keys()].slice(0, 50);
  const journalEntries = await loadJournalEntries(run, candidateIds);
  const journalIds = journalEntries.map((row) => row.id).filter(Boolean);
  const exactLedgerLines = await loadExactLedgerLines(run, periodContext.current, candidateIds, journalIds);
  const accountIds = [...new Set(exactLedgerLines.map((row) => row.account_id).filter(Boolean))].slice(0, 25);

  const [accountMetadata, currentMovementRows, previousMovementRows, controlRecords] = await Promise.all([
    loadAccountMetadata(run, accountIds),
    loadPeriodMovement(run, periodContext.current, accountIds),
    loadPeriodMovement(run, periodContext.previous, accountIds),
    loadControlRecords(run, candidateIds),
  ]);

  const accountsById = new Map(accountMetadata.map((row) => [row.id, row]));
  const exactByAccount = byAccount(exactLedgerLines);
  const currentByAccount = byAccount(currentMovementRows);
  const previousByAccount = byAccount(previousMovementRows);
  const ledgerAccounts = accountIds.map((accountId) => {
    const account = accountsById.get(accountId) || { id: accountId, account_name: "Unknown account", account_code: "" };
    const linked = movement(exactByAccount.get(accountId) || []);
    const current = movement(currentByAccount.get(accountId) || []);
    const priorRows = previousByAccount.get(accountId) || [];
    const prior = periodContext.previous ? movement(priorRows) : null;
    const change = prior ? round(current.net - prior.net) : null;
    const changePercent = prior && Math.abs(prior.net) >= 0.01 ? round((change / Math.abs(prior.net)) * 100) : null;
    return {
      account_id: accountId,
      account_code: account.account_code || "",
      account_name: account.account_name || "Unknown account",
      account_category: account.account_category || null,
      normal_balance: account.normal_balance || null,
      currency_code: account.currency_code || null,
      linked_impact: linked,
      current_period_movement: current,
      previous_period_movement: prior,
      change,
      change_percent: changePercent,
    };
  });

  const activeEvidence = documents.filter((link) => link.status === "ACTIVE");
  const openNotes = (notesResult.data || []).filter((note) => note.status !== "RESOLVED");
  const activeSignoffs = (signoffsResult.data || []).filter((signoff) => !signoff.revoked_at);
  const candidateBasis = Object.fromEntries(
    [...candidateMap.entries()].map(([id, bases]) => [id, [...bases]]),
  );

  return {
    run,
    work_item: item,
    review_item: reviewItem,
    period: {
      source: periodContext.source,
      current: periodContext.current,
      previous: periodContext.previous,
    },
    prior_work: previousWork,
    evidence: {
      links: documents,
      active_count: activeEvidence.length,
      controlled_count: activeEvidence.filter((link) => link.document?.controlled === true).length,
      approval_pending: activeEvidence.filter((link) => link.document?.approval_required === true && !link.document?.approved_at).length,
    },
    review_control: {
      notes: notesResult.data || [],
      open_points: openNotes.length,
      signoffs: signoffsResult.data || [],
      active_signoffs: activeSignoffs,
    },
    system_verification: {
      mode: item.metadata?.system_verification?.mode || null,
      applicable: item.metadata?.system_gate?.applicable === true,
      satisfied: item.metadata?.system_gate?.satisfied === true,
      checked_at: item.metadata?.system_gate?.checked_at || item.evidence?.system_checked_at || null,
      invalidated_at: item.metadata?.system_gate?.invalidated_at || null,
      blockers: Array.isArray(item.metadata?.system_gate?.blockers) ? item.metadata.system_gate.blockers.slice(0, 50) : [],
      evidence: Array.isArray(item.metadata?.system_gate?.evidence) ? item.metadata.system_gate.evidence.slice(0, 50) : [],
    },
    ledger_impact: {
      linked: exactLedgerLines.length > 0,
      reason: exactLedgerLines.length
        ? "Ledger lines are linked through governed record, journal or evidence identifiers."
        : "No deterministic ledger linkage was found. Avantiqo does not infer journal impact from names or narrative text.",
      candidate_identifiers: candidateBasis,
      journal_entries: journalEntries,
      linked_lines: exactLedgerLines,
      linked_totals: movement(exactLedgerLines),
      accounts: ledgerAccounts,
    },
    control_records: controlRecords,
  };
}
