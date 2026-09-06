import { createHash } from "node:crypto";

import { fetchCompleteFinancePopulation } from "@/lib/finance/data/fetchCompleteFinancePopulation";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const FINANCE_CLOSE_PACKAGE_FINGERPRINT_VERSION = 1;

const VOLATILE_KEYS = new Set([
  "created_at",
  "updated_at",
  "generated_at",
  "generatedAt",
  "requested_at",
]);

const SECTION_LABELS = Object.freeze({
  period: "Accounting period state changed",
  ledger: "General ledger changed after close",
  journals: "Journal population changed after close",
  close_steps: "Governed close steps changed",
  reconciliations: "Bank reconciliation evidence changed",
  tax_and_statutory: "VAT or statutory filing evidence changed",
  close_adjustments: "FX or depreciation close evidence changed",
  review_and_approval: "Review or approval evidence changed",
});

function clean(value) {
  return String(value ?? "").trim();
}

function stable(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value
      .map(stable)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !VOLATILE_KEYS.has(key))
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function rangeQuery(query, startDate, endDate, field = "posting_date") {
  let scoped = query;
  if (startDate) scoped = scoped.gte(field, String(startDate).slice(0, 10));
  if (endDate) scoped = scoped.lte(field, String(endDate).slice(0, 10));
  return scoped;
}

async function complete(label, buildQuery) {
  return fetchCompleteFinancePopulation({ label, buildQuery });
}

async function loadPeriod({ organizationId, entityId, periodId }) {
  const { data, error } = await supabaseAdmin
    .from("accounting_periods")
    .select("*")
    .eq("id", periodId)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Accounting period is outside organization or entity scope");
  return data;
}

async function loadReviewSignoffs(organizationId, reviewItems) {
  const ids = reviewItems.map((row) => row.id).filter(Boolean);
  if (!ids.length) return { rows: [], pages: 0, complete: true };
  return complete("Close-package Finance review sign-off population", (from, to) =>
    supabaseAdmin
      .from("finance_review_signoffs")
      .select("*")
      .eq("organization_id", organizationId)
      .in("review_item_id", ids)
      .order("review_item_id", { ascending: true })
      .order("signed_at", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

export async function buildFinanceClosePackageSnapshot({ organizationId, entityId, periodId }) {
  const orgId = clean(organizationId);
  const scopedEntityId = clean(entityId);
  const scopedPeriodId = clean(periodId);
  if (!orgId || !scopedEntityId || !scopedPeriodId) {
    throw new Error("organizationId, entityId and periodId are required for close-package freshness");
  }

  const period = await loadPeriod({ organizationId: orgId, entityId: scopedEntityId, periodId: scopedPeriodId });
  const startDate = period.start_date ? String(period.start_date).slice(0, 10) : null;
  const endDate = period.end_date ? String(period.end_date).slice(0, 10) : null;
  if (!startDate || !endDate) throw new Error("Accounting period dates are required for close-package freshness");

  const [ledger, journals, closeSteps, reconciliations, vatReturns, filings, fxRuns, depreciationRuns, reviewItems, approvals] = await Promise.all([
    complete("Close-package general-ledger population", (from, to) => {
      let query = supabaseAdmin
        .from("general_ledger")
        .select("id,account_id,journal_entry_id,reference_type,reference_id,description,debit,credit,currency_code,posting_date,period_id")
        .eq("organization_id", orgId)
        .eq("entity_id", scopedEntityId);
      query = rangeQuery(query, startDate, endDate);
      return query.order("posting_date", { ascending: true }).order("id", { ascending: true }).range(from, to);
    }),
    complete("Close-package journal population", (from, to) => {
      let query = supabaseAdmin
        .from("journal_entries")
        .select("id,journal_number,entry_number,entry_date,posting_date,description,source_type,source_module,source_document,source_document_id,status,currency_code,reference,entity_id,legal_entity_id,period_id,approved_by,approved_at,reversed,reversal_status")
        .eq("organization_id", orgId)
        .or(`entity_id.eq.${scopedEntityId},legal_entity_id.eq.${scopedEntityId}`);
      query = rangeQuery(query, startDate, endDate);
      return query.order("posting_date", { ascending: true }).order("id", { ascending: true }).range(from, to);
    }),
    complete("Close-package period-step population", (from, to) =>
      supabaseAdmin
        .from("finance_period_close_steps")
        .select("*")
        .eq("organization_id", orgId)
        .eq("entity_id", scopedEntityId)
        .eq("period_id", scopedPeriodId)
        .order("step_type", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    complete("Close-package bank-reconciliation population", (from, to) => {
      let query = supabaseAdmin
        .from("finance_bank_reconciliation_runs")
        .select("*")
        .eq("organization_id", orgId)
        .eq("entity_id", scopedEntityId);
      query = rangeQuery(query, startDate, endDate, "reconciliation_date");
      return query.order("reconciliation_date", { ascending: true, nullsFirst: false }).order("id", { ascending: true }).range(from, to);
    }),
    complete("Close-package VAT-return population", (from, to) =>
      supabaseAdmin
        .from("finance_vat_returns")
        .select("*")
        .eq("organization_id", orgId)
        .eq("entity_id", scopedEntityId)
        .lte("period_start", endDate)
        .gte("period_end", startDate)
        .order("period_start", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    complete("Close-package statutory-filing population", (from, to) =>
      supabaseAdmin
        .from("finance_statutory_filings")
        .select("*")
        .eq("organization_id", orgId)
        .eq("entity_id", scopedEntityId)
        .eq("period_id", scopedPeriodId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    complete("Close-package FX-revaluation population", (from, to) => {
      let query = supabaseAdmin
        .from("finance_fx_revaluation_runs")
        .select("*")
        .eq("organization_id", orgId)
        .eq("entity_id", scopedEntityId);
      query = rangeQuery(query, startDate, endDate, "revaluation_date");
      return query.order("revaluation_date", { ascending: true, nullsFirst: false }).order("id", { ascending: true }).range(from, to);
    }),
    complete("Close-package depreciation population", (from, to) =>
      supabaseAdmin
        .from("finance_depreciation_runs")
        .select("*")
        .eq("organization_id", orgId)
        .eq("entity_id", scopedEntityId)
        .lte("period_start", endDate)
        .gte("period_end", startDate)
        .order("period_start", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    complete("Close-package Finance review population", (from, to) =>
      supabaseAdmin
        .from("finance_review_items")
        .select("*")
        .eq("organization_id", orgId)
        .eq("entity_id", scopedEntityId)
        .eq("period_id", scopedPeriodId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    complete("Close-package Finance approval population", (from, to) =>
      supabaseAdmin
        .from("finance_approval_requests")
        .select("*")
        .eq("organization_id", orgId)
        .eq("entity_id", scopedEntityId)
        .eq("period_id", scopedPeriodId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const signoffs = await loadReviewSignoffs(orgId, reviewItems.rows);
  const population = {
    ledger: ledger.rows.length,
    journals: journals.rows.length,
    close_steps: closeSteps.rows.length,
    reconciliations: reconciliations.rows.length,
    vat_returns: vatReturns.rows.length,
    statutory_filings: filings.rows.length,
    fx_revaluations: fxRuns.rows.length,
    depreciation_runs: depreciationRuns.rows.length,
    review_items: reviewItems.rows.length,
    review_signoffs: signoffs.rows.length,
    approvals: approvals.rows.length,
  };

  return {
    scope: { organization_id: orgId, entity_id: scopedEntityId, period_id: scopedPeriodId },
    population_complete: true,
    population,
    sections: {
      period,
      ledger: ledger.rows,
      journals: journals.rows,
      close_steps: closeSteps.rows,
      reconciliations: reconciliations.rows,
      tax_and_statutory: { vat_returns: vatReturns.rows, statutory_filings: filings.rows },
      close_adjustments: { fx_revaluations: fxRuns.rows, depreciation_runs: depreciationRuns.rows },
      review_and_approval: { review_items: reviewItems.rows, review_signoffs: signoffs.rows, approvals: approvals.rows },
    },
  };
}

export function buildFinanceClosePackageFingerprint(snapshot) {
  if (!snapshot?.population_complete || !snapshot?.scope) {
    throw new Error("Complete close-package accounting snapshot is required");
  }
  const sectionDigests = Object.fromEntries(
    Object.keys(SECTION_LABELS).map((section) => [section, digest(snapshot.sections?.[section] ?? null)]),
  );
  const core = {
    version: FINANCE_CLOSE_PACKAGE_FINGERPRINT_VERSION,
    scope: snapshot.scope,
    sections: sectionDigests,
  };
  return {
    ...core,
    digest: digest(core),
    population: snapshot.population || {},
  };
}

export function compareFinanceClosePackageFingerprints(stored, current) {
  if (!stored?.digest || !current?.digest) {
    return { matches: false, changed_sections: Object.keys(SECTION_LABELS) };
  }
  if (Number(stored.version) !== FINANCE_CLOSE_PACKAGE_FINGERPRINT_VERSION) {
    return { matches: false, changed_sections: Object.keys(SECTION_LABELS), version_mismatch: true };
  }
  const changedSections = Object.keys(SECTION_LABELS).filter(
    (section) => clean(stored?.sections?.[section]) !== clean(current?.sections?.[section]),
  );
  const scopeChanged = digest(stored.scope || {}) !== digest(current.scope || {});
  return {
    matches: !scopeChanged && changedSections.length === 0 && clean(stored.digest) === clean(current.digest),
    changed_sections: changedSections,
    scope_changed: scopeChanged,
  };
}

export function evaluateFinanceClosePackageFreshness({ snapshot, closeRun }) {
  const current = buildFinanceClosePackageFingerprint(snapshot);
  const stored = closeRun?.result?.package_fingerprint || null;
  if (!closeRun) {
    return { state: "NOT_CLOSED", trusted: false, reason: "No governed period close run exists", changed_sections: [], changed_labels: [], current_fingerprint: current, stored_fingerprint: null };
  }
  if (!stored?.digest) {
    return {
      state: "UNPROVEN",
      trusted: false,
      reason: "This close predates deterministic close-package freshness and must be revalidated before the package is relied on",
      changed_sections: Object.keys(SECTION_LABELS),
      changed_labels: Object.values(SECTION_LABELS),
      current_fingerprint: current,
      stored_fingerprint: stored,
    };
  }
  const comparison = compareFinanceClosePackageFingerprints(stored, current);
  return {
    state: comparison.matches ? "CURRENT" : "STALE",
    trusted: comparison.matches,
    reason: comparison.matches
      ? "Current accounting truth matches the governed close baseline"
      : "Accounting truth changed after the governed close baseline",
    changed_sections: comparison.changed_sections,
    changed_labels: comparison.changed_sections.map((section) => SECTION_LABELS[section] || section),
    scope_changed: comparison.scope_changed === true,
    version_mismatch: comparison.version_mismatch === true,
    current_fingerprint: current,
    stored_fingerprint: stored,
  };
}

export async function persistFinanceClosePackageFingerprint({ organizationId, entityId, periodId, closeType, fingerprint }) {
  const { data: closeRun, error: loadError } = await supabaseAdmin
    .from("finance_period_close_runs")
    .select("id,result,status,close_type,closed_at")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("period_id", periodId)
    .eq("close_type", closeType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!closeRun) throw new Error(`Governed ${closeType} close run was not found after atomic close`);

  const existingFingerprint = closeRun.result?.package_fingerprint || null;
  if (existingFingerprint?.digest) {
    return {
      close_run: closeRun,
      fingerprint: existingFingerprint,
      baseline_preserved: true,
    };
  }

  const nextResult = {
    ...(closeRun.result && typeof closeRun.result === "object" ? closeRun.result : {}),
    package_fingerprint: fingerprint,
  };
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("finance_period_close_runs")
    .update({ result: nextResult, updated_at: new Date().toISOString() })
    .eq("id", closeRun.id)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("period_id", periodId)
    .select("id,status,close_type,closed_at,result")
    .single();
  if (updateError) throw updateError;
  return {
    close_run: updated,
    fingerprint,
    baseline_preserved: false,
  };
}

export async function recordFinanceClosePackageBaseline({ organizationId, entityId, periodId, closeType }) {
  const snapshot = await buildFinanceClosePackageSnapshot({ organizationId, entityId, periodId });
  const candidateFingerprint = buildFinanceClosePackageFingerprint(snapshot);
  return persistFinanceClosePackageFingerprint({
    organizationId,
    entityId,
    periodId,
    closeType,
    fingerprint: candidateFingerprint,
  });
}

export function financeClosePackageChangedLabels() {
  return { ...SECTION_LABELS };
}
