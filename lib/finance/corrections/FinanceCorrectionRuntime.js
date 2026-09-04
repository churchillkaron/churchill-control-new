import { postJournalEntrySafe } from "@/lib/finance/general-ledger/capabilities/postJournalEntrySafe";
import { validateJournalIntegrity } from "@/lib/finance/general-ledger/guards/validateJournalIntegrity";
import { getFinanceEvidenceDocument } from "@/lib/finance/practice/FinanceEvidenceDocumentRuntime";
import { loadFinanceAccountHealthRuntime } from "@/lib/finance/ui/loadFinanceAccountHealthRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const CORRECTION_DOCUMENT_TYPE = "ACCOUNTING_CORRECTION";
const OPEN_EXCEPTION_STATES = new Set(["BLOCKED", "ACTION_REQUIRED"]);
const ACTIVE_CORRECTION_STATUSES = ["DRAFT", "REJECTED", "PENDING", "APPROVED"];

function clean(value) { return String(value ?? "").trim(); }
function upper(value) { return clean(value).toUpperCase(); }
function number(value) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0; }
function round(value) { return Math.round((number(value) + Number.EPSILON) * 100) / 100; }

function treatmentFor(exception) {
  const reason = clean(exception?.reason).toLowerCase();
  if (reason.includes("bank-account mapping")) return "Confirm how the cash balance is substantiated. Link the bank account when bank-backed; post a journal only when evidence proves the ledger balance itself is wrong.";
  if (reason.includes("bank reconciliation")) return "Resolve the bank-to-book reconciliation difference first. Post only the correcting entry supported by the reconciliation evidence.";
  if (reason.includes("classification")) return "Correct the chart-of-accounts classification first. Use a journal only if the classification review also proves a posting error.";
  if (reason.includes("opposite the configured")) return "Substantiate the balance and identify the source posting or classification cause. Do not reverse solely because the sign is unusual.";
  return "Substantiate the exception, identify the accounting cause, and record only the correction supported by evidence.";
}

function normalizeLines(lines = []) {
  return (Array.isArray(lines) ? lines : []).map((line) => ({
    account_id: clean(line?.account_id),
    debit: round(line?.debit),
    credit: round(line?.credit),
    description: clean(line?.description) || null,
    department_id: clean(line?.department_id) || null,
    cost_center_id: clean(line?.cost_center_id) || null,
    party_id: clean(line?.party_id) || null,
    project_id: clean(line?.project_id) || null,
  }));
}

async function validateAccounts({ organizationId, entityId, lines }) {
  const ids = [...new Set(lines.map((line) => line.account_id).filter(Boolean))];
  if (!ids.length) throw new Error("Correction journal needs accounts");
  const { data, error } = await supabaseAdmin.from("chart_of_accounts")
    .select("id,account_code,account_name,is_active")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .in("id", ids);
  if (error) throw error;
  const found = new Set((data || []).filter((row) => row.is_active !== false).map((row) => row.id));
  if (ids.some((id) => !found.has(id))) throw new Error("Correction journal contains inactive or out-of-scope accounts");
  return data || [];
}

async function validateEvidence({ clientOrganizationId, entityId, documentIds, treatment, requireBasis = false, requireDocument = false }) {
  const ids = [...new Set((Array.isArray(documentIds) ? documentIds : []).map(clean).filter(Boolean))];
  if (requireDocument && !ids.length) throw new Error("Journal corrections require at least one governed source document");
  if (requireBasis && !ids.length && clean(treatment?.evidence_basis).length < 10) {
    throw new Error("Correction requires an evidence basis or governed source document");
  }
  const documents = await Promise.all(ids.map((documentId) => getFinanceEvidenceDocument({ organizationId: clientOrganizationId, documentId })));
  if (documents.some((document) => !document)) throw new Error("Correction evidence contains a missing or out-of-scope document");
  for (const document of documents) {
    if (document.entity_id && clean(document.entity_id) !== clean(entityId)) throw new Error("Correction evidence belongs to another legal entity");
    if (document.approval_required === true && !document.approved_at) throw new Error("Correction evidence is still pending document approval");
  }
  return {
    document_ids: ids,
    validated_at: ids.length ? new Date().toISOString() : null,
    documents: documents.map((document) => ({
      id: document.id,
      source: document.source,
      controlled: document.controlled === true,
      version_number: document.version_number || 1,
      checksum_sha256: document.checksum_sha256 || null,
      status: document.status || null,
      approved_at: document.approved_at || null,
    })),
  };
}

function withEvidenceBoundary(metadata, validation, { stage, actorId, phase }) {
  const checkedAt = validation?.validated_at || new Date().toISOString();
  const priorEvidence = metadata?.evidence || {};
  const boundary = {
    stage,
    phase,
    checked_at: checkedAt,
    actor_id: actorId || null,
    document_count: Array.isArray(validation?.document_ids) ? validation.document_ids.length : 0,
    document_ids: Array.isArray(validation?.document_ids) ? [...validation.document_ids] : [],
    documents: Array.isArray(validation?.documents) ? validation.documents.map((document) => ({ ...document })) : [],
    evidence_basis_present: clean(metadata?.treatment?.evidence_basis).length >= 10,
  };
  return {
    ...(metadata || {}),
    evidence: {
      ...priorEvidence,
      ...(validation || {}),
      boundary_validations: {
        ...(priorEvidence.boundary_validations || {}),
        [stage]: boundary,
      },
    },
  };
}

async function loadCase({ accountingFirmId, correctionId }) {
  const { data, error } = await supabaseAdmin.from("finance_approval_requests")
    .select("*")
    .eq("id", correctionId)
    .eq("organization_id", accountingFirmId)
    .eq("document_type", CORRECTION_DOCUMENT_TYPE)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Accounting correction not found");
  return data;
}

async function loadCurrentException(current) {
  const meta = current.metadata || {};
  const clientOrganizationId = clean(meta.client_organization_id);
  const accountId = clean(meta.exception?.account_id);
  if (!clientOrganizationId || !accountId || !current.entity_id || !current.period_id) {
    throw new Error("Accounting correction is missing its source-exception identity");
  }
  const health = await loadFinanceAccountHealthRuntime({
    organizationId: clientOrganizationId,
    entityId: current.entity_id,
    periodId: current.period_id,
    currency: current.currency_code,
  });
  const exception = health.health?.accounts?.find((row) => row.account_id === accountId) || null;
  const resolved = !exception || !OPEN_EXCEPTION_STATES.has(exception.state);
  return {
    health,
    exception,
    resolved,
    recheck: {
      checked_at: new Date().toISOString(),
      prior_state: meta.exception?.state || null,
      resulting_state: exception?.state || "NOT_PRESENT",
      resolved,
      reason: exception?.reason || "Original structural exception is no longer surfaced.",
    },
  };
}

async function closeResolvedCorrection({ accountingFirmId, current, preflight, stage }) {
  const metadata = {
    ...(current.metadata || {}),
    recheck: { ...preflight.recheck, stage },
    resolution: {
      resolved_at: new Date().toISOString(),
      resolution_mode: upper(current.metadata?.resolution_mode || "CONTROL"),
      source_exception_cleared: true,
      stage,
    },
  };
  const { data, error } = await supabaseAdmin.from("finance_approval_requests").update({
    status: "RESOLVED",
    metadata,
    updated_at: new Date().toISOString(),
  }).eq("id", current.id).eq("organization_id", accountingFirmId).select("*").single();
  if (error) throw error;
  return data;
}

async function assertExceptionStillOpen({ accountingFirmId, current, stage }) {
  const preflight = await loadCurrentException(current);
  if (!preflight.resolved) return preflight;
  await closeResolvedCorrection({ accountingFirmId, current, preflight, stage });
  throw new Error(`Original structural exception cleared before ${stage}; correction closed as RESOLVED`);
}

async function assertEvidenceReady(current) {
  const mode = upper(current.metadata?.resolution_mode || "CONTROL");
  return validateEvidence({
    clientOrganizationId: current.metadata?.client_organization_id,
    entityId: current.entity_id,
    documentIds: current.metadata?.evidence?.document_ids || [],
    treatment: current.metadata?.treatment || {},
    requireBasis: true,
    requireDocument: mode === "JOURNAL",
  });
}

async function findOpenDuplicate({ accountingFirmId, clientOrganizationId, entityId, periodId, accountId }) {
  const { data, error } = await supabaseAdmin.from("finance_approval_requests")
    .select("id,status,metadata,created_at")
    .eq("organization_id", accountingFirmId)
    .eq("entity_id", entityId)
    .eq("period_id", periodId)
    .eq("document_type", CORRECTION_DOCUMENT_TYPE)
    .in("status", ACTIVE_CORRECTION_STATUSES)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []).find((row) =>
    clean(row.metadata?.client_organization_id) === clean(clientOrganizationId) &&
    clean(row.metadata?.exception?.account_id) === clean(accountId)
  ) || null;
}

export async function listFinanceCorrections({ organizationId, entityId, periodId }) {
  let query = supabaseAdmin.from("finance_approval_requests").select("*")
    .eq("organization_id", organizationId)
    .eq("document_type", CORRECTION_DOCUMENT_TYPE)
    .order("created_at", { ascending: false })
    .limit(200);
  if (entityId) query = query.eq("entity_id", entityId);
  if (periodId) query = query.eq("period_id", periodId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function listCorrectionAccounts({ organizationId, entityId }) {
  const { data, error } = await supabaseAdmin.from("chart_of_accounts")
    .select("id,account_code,account_name,account_category,account_type,normal_balance,currency_code,is_active")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("is_active", true)
    .order("account_code", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return data || [];
}

export async function createFinanceCorrection({ accountingFirmId, clientOrganizationId, entityId, periodId, accountId, requestedBy, currency }) {
  const duplicate = await findOpenDuplicate({ accountingFirmId, clientOrganizationId, entityId, periodId, accountId });
  if (duplicate) throw new Error(`An active correction already exists for this account (${duplicate.status})`);
  const health = await loadFinanceAccountHealthRuntime({ organizationId: clientOrganizationId, entityId, periodId, currency });
  const exception = health.health?.accounts?.find((row) => row.account_id === accountId) || null;
  if (!exception || !OPEN_EXCEPTION_STATES.has(exception.state)) throw new Error("This account no longer has a structural exception requiring correction");
  const metadata = {
    correction_version: 4,
    client_organization_id: clientOrganizationId,
    resolution_mode: "CONTROL",
    exception: { key: `account-health:${exception.account_id}`, ...exception, observed_at: health.generated_at },
    treatment: { summary: treatmentFor(exception), rationale: "", evidence_basis: "" },
    journal_draft: {
      posting_date: health.context?.as_of || health.context?.period_end,
      document_date: health.context?.as_of || health.context?.period_end,
      journal_type: "CORRECTION",
      reference: null,
      description: `Correction for ${exception.account_code || exception.account_name}`,
      currency_code: currency || health.context?.currency || null,
      exchange_rate: 1,
      lines: [],
    },
    evidence: { document_ids: [], validated_at: null, documents: [], boundary_validations: {} },
    posting: null,
    recheck: null,
    resolution: null,
  };
  const { data, error } = await supabaseAdmin.from("finance_approval_requests").insert({
    organization_id: accountingFirmId,
    entity_id: entityId,
    period_id: periodId,
    workflow_id: null,
    document_type: CORRECTION_DOCUMENT_TYPE,
    document_id: null,
    amount: null,
    currency_code: currency || health.context?.currency || null,
    requested_by: requestedBy || null,
    assigned_role: "ACCOUNTING_REVIEWER",
    status: "DRAFT",
    metadata,
  }).select("*").single();
  if (error?.code === "23505") throw new Error("An active correction already exists for this account");
  if (error) throw error;
  return data;
}

export async function saveFinanceCorrection({ accountingFirmId, correctionId, actorId, resolutionMode, treatment, journalDraft, documentIds, submit = false }) {
  const current = await loadCase({ accountingFirmId, correctionId });
  if (!["DRAFT", "REJECTED"].includes(upper(current.status))) throw new Error("Only draft or rejected corrections can be edited");
  if (current.requested_by && actorId && String(current.requested_by) !== String(actorId)) throw new Error("Only the correction preparer can edit this draft");
  if (submit) await assertExceptionStillOpen({ accountingFirmId, current, stage: "submission" });

  const mode = upper(resolutionMode || current.metadata?.resolution_mode || "CONTROL");
  if (!["CONTROL", "JOURNAL"].includes(mode)) throw new Error("resolutionMode must be CONTROL or JOURNAL");
  const draft = { ...(current.metadata?.journal_draft || {}), ...(journalDraft || {}) };
  draft.lines = normalizeLines(draft.lines);
  let amount = null;
  if (mode === "JOURNAL") {
    validateJournalIntegrity(draft.lines);
    await validateAccounts({ organizationId: current.metadata?.client_organization_id, entityId: current.entity_id, lines: draft.lines });
    if (!clean(draft.currency_code)) throw new Error("Correction journal currency is required");
    if (number(draft.exchange_rate) <= 0) throw new Error("Correction journal exchange rate must be positive");
    amount = round(draft.lines.reduce((total, line) => total + number(line.debit), 0));
  }

  const treatmentNext = { ...(current.metadata?.treatment || {}), ...(treatment || {}) };
  const evidence = await validateEvidence({
    clientOrganizationId: current.metadata?.client_organization_id,
    entityId: current.entity_id,
    documentIds: documentIds || current.metadata?.evidence?.document_ids || [],
    treatment: treatmentNext,
    requireBasis: submit,
    requireDocument: submit && mode === "JOURNAL",
  });
  let metadata = { ...(current.metadata || {}), resolution_mode: mode, treatment: treatmentNext, journal_draft: draft, evidence };
  if (submit) {
    metadata = withEvidenceBoundary(metadata, evidence, {
      stage: "submission",
      actorId,
      phase: "PRE_SUBMISSION",
    });
  }
  const { data, error } = await supabaseAdmin.from("finance_approval_requests").update({
    status: submit ? "PENDING" : "DRAFT",
    amount,
    currency_code: clean(draft.currency_code) || current.currency_code || null,
    decision_notes: submit ? null : current.decision_notes,
    decided_at: submit ? null : current.decided_at,
    decided_by: submit ? null : current.decided_by,
    metadata,
    updated_at: new Date().toISOString(),
  }).eq("id", current.id).eq("organization_id", accountingFirmId).select("*").single();
  if (error) throw error;
  return data;
}

export async function decideFinanceCorrection({ accountingFirmId, correctionId, actorId, approve, note }) {
  const current = await loadCase({ accountingFirmId, correctionId });
  if (upper(current.status) !== "PENDING") throw new Error("Correction must be pending before approval decision");
  if (current.requested_by && actorId && String(current.requested_by) === String(actorId)) throw new Error("Segregation of duties blocks the preparer from approving their own correction");
  let metadata = current.metadata || {};
  if (approve) {
    await assertExceptionStillOpen({ accountingFirmId, current, stage: "approval" });
    const approvalEvidence = await assertEvidenceReady(current);
    metadata = withEvidenceBoundary(metadata, approvalEvidence, {
      stage: "approval",
      actorId,
      phase: "PRE_APPROVAL_DECISION",
    });
  }
  const { data, error } = await supabaseAdmin.from("finance_approval_requests").update({
    status: approve ? "APPROVED" : "REJECTED",
    decision_notes: clean(note) || null,
    decided_at: new Date().toISOString(),
    decided_by: actorId || null,
    metadata,
    updated_at: new Date().toISOString(),
  }).eq("id", current.id).eq("organization_id", accountingFirmId).select("*").single();
  if (error) throw error;
  return data;
}

export async function recheckFinanceCorrection({ accountingFirmId, correctionId }) {
  const current = await loadCase({ accountingFirmId, correctionId });
  const preflight = await loadCurrentException(current);
  const shouldResolve = preflight.resolved && upper(current.status) !== "POSTED";
  const metadata = {
    ...(current.metadata || {}),
    recheck: { ...preflight.recheck, stage: "manual_recheck" },
    ...(shouldResolve ? {
      resolution: {
        resolved_at: new Date().toISOString(),
        resolution_mode: upper(current.metadata?.resolution_mode || "CONTROL"),
        source_exception_cleared: true,
        stage: "manual_recheck",
      },
    } : {}),
  };
  const { data, error } = await supabaseAdmin.from("finance_approval_requests").update({
    status: shouldResolve ? "RESOLVED" : current.status,
    metadata,
    updated_at: new Date().toISOString(),
  }).eq("id", current.id).eq("organization_id", accountingFirmId).select("*").single();
  if (error) throw error;
  return { correction: data, recheck: preflight.recheck, health: preflight.health };
}

export async function postFinanceCorrection({ accountingFirmId, correctionId, actorId }) {
  const current = await loadCase({ accountingFirmId, correctionId });
  if (upper(current.status) === "POSTED") return recheckFinanceCorrection({ accountingFirmId, correctionId });
  if (upper(current.status) !== "APPROVED") throw new Error("Correction must be approved before posting");
  if (current.requested_by && current.decided_by && String(current.requested_by) === String(current.decided_by)) throw new Error("Invalid correction approval: preparer and approver cannot be the same user");
  if (upper(current.metadata?.resolution_mode) !== "JOURNAL") throw new Error("Control corrections are re-checked after the control is fixed; they are not journal-posted");
  await assertExceptionStillOpen({ accountingFirmId, current, stage: "posting" });
  const postingEvidence = await assertEvidenceReady(current);
  const preflightMetadata = withEvidenceBoundary(current.metadata || {}, postingEvidence, {
    stage: "posting",
    actorId,
    phase: "PRE_FINANCIAL_SIDE_EFFECT",
  });
  const { data: postingReady, error: preflightError } = await supabaseAdmin.from("finance_approval_requests").update({
    metadata: preflightMetadata,
    updated_at: new Date().toISOString(),
  }).eq("id", current.id).eq("organization_id", accountingFirmId).eq("status", "APPROVED").select("*").single();
  if (preflightError) throw preflightError;

  const draft = postingReady.metadata?.journal_draft || {};
  const lines = normalizeLines(draft.lines);
  validateJournalIntegrity(lines);
  await validateAccounts({ organizationId: postingReady.metadata?.client_organization_id, entityId: postingReady.entity_id, lines });

  const posted = await postJournalEntrySafe({
    organizationId: postingReady.metadata?.client_organization_id,
    entityId: postingReady.entity_id,
    postingDate: draft.posting_date,
    documentDate: draft.document_date || draft.posting_date,
    journalType: draft.journal_type || "CORRECTION",
    reference: draft.reference || `Correction ${postingReady.id.slice(0, 8)}`,
    sourceModule: "finance_correction",
    sourceDocument: CORRECTION_DOCUMENT_TYPE,
    sourceDocumentId: postingReady.id,
    description: draft.description || postingReady.metadata?.treatment?.summary || "Accounting correction",
    currencyCode: draft.currency_code || postingReady.currency_code,
    exchangeRate: number(draft.exchange_rate || 1),
    lines,
    createdBy: actorId || null,
    idempotencyKey: `finance-correction:${postingReady.id}`,
  });
  const journalId = posted?.journal?.id || posted?.ledger?.journalEntryId || null;
  const metadata = {
    ...(postingReady.metadata || {}),
    posting: {
      journal_entry_id: journalId,
      posted_at: new Date().toISOString(),
      idempotency_key: `finance-correction:${postingReady.id}`,
    },
  };
  const { error } = await supabaseAdmin.from("finance_approval_requests").update({
    status: "POSTED",
    metadata,
    updated_at: new Date().toISOString(),
  }).eq("id", postingReady.id).eq("organization_id", accountingFirmId);
  if (error) throw error;
  const rechecked = await recheckFinanceCorrection({ accountingFirmId, correctionId: postingReady.id });
  return { ...rechecked, journal: posted };
}