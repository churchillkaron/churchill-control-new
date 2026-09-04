export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { fetchCompleteFinancePopulation } from "@/lib/finance/data/fetchCompleteFinancePopulation";
import { loadPeriodCloseChecklist } from "@/lib/finance/period-close/runtime/PeriodCloseStepApplicationService";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const DEFAULT_MONTH_END_STEPS = [
  "SUBLEDGER_RECONCILIATION",
  "BANK_RECONCILIATION",
  "DEPRECIATION",
  "FX_REVALUATION",
  "TAX_CLOSE",
];
const OPEN_APPROVAL_STATUSES = ["pending", "PENDING", "requested", "REQUESTED", "open", "OPEN"];
const OPEN_REVIEW_STATUSES = ["OPEN", "IN_PREPARATION", "READY_FOR_REVIEW", "CHANGES_REQUESTED"];
const EPSILON = 0.000001;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizedStatus(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function amount(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isComplete(value) {
  return new Set([
    "complete",
    "completed",
    "closed",
    "done",
    "passed",
    "posted",
    "submitted",
    "approved",
    "reconciled",
    "certified",
    "skipped",
  ]).has(normalizedStatus(value));
}

function jsonError(message, status = 400, details = undefined) {
  return NextResponse.json(
    { success: false, error: message, ...(details ? { details } : {}) },
    { status },
  );
}

async function requireView(access) {
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.accounting.view",
    fullAccess: access.permissions?.includes("*") === true,
  });
}

async function safePopulation(source, task) {
  try {
    const population = await task();
    return {
      source,
      status: "connected",
      rows: population.rows,
      population: {
        complete: population.complete === true,
        rows: population.rows.length,
        pages: population.pages,
        page_size: population.page_size,
        max_rows: population.max_rows,
      },
      error: null,
    };
  } catch (error) {
    console.error("FINANCE_CLOSE_CONTROL_TOWER_SOURCE_FAILED", { source, error });
    return {
      source,
      status: "error",
      rows: [],
      population: { complete: false, rows: 0, pages: 0 },
      error: error?.message || "Accounting population unavailable",
    };
  }
}

async function safeSingle(source, task) {
  try {
    return { source, status: "connected", row: await task(), error: null };
  } catch (error) {
    console.error("FINANCE_CLOSE_CONTROL_TOWER_SOURCE_FAILED", { source, error });
    return { source, status: "error", row: null, error: error?.message || "Accounting source unavailable" };
  }
}

function sourceSummary(source) {
  return {
    status: source.status,
    error: source.error,
    population: source.population || null,
  };
}

function latestBy(rows, key, dateKeys) {
  const map = new Map();
  for (const row of rows || []) {
    const id = row?.[key];
    if (!id) continue;
    const current = map.get(id);
    if (!current) {
      map.set(id, row);
      continue;
    }
    const rowDate = dateKeys.map((dateKey) => row?.[dateKey]).find(Boolean) || "";
    const currentDate = dateKeys.map((dateKey) => current?.[dateKey]).find(Boolean) || "";
    if (String(rowDate) > String(currentDate)) map.set(id, row);
  }
  return map;
}

function accountName(row) {
  return clean(row?.account_name) || clean(row?.bank_name) || clean(row?.name) || clean(row?.account_number) || "Bank account";
}

function accountScopeMatches(row, entityId) {
  if (!row || row.active === false) return false;
  if (["inactive", "archived", "closed"].includes(normalizedStatus(row.status))) return false;
  return !row.entity_id || row.entity_id === entityId;
}

function stepRows(requiredSteps, persistedRows) {
  const latest = latestBy(persistedRows, "step_type", ["updated_at", "completed_at", "created_at"]);
  return requiredSteps.map((stepType) => {
    const persisted = latest.get(stepType) || null;
    return {
      id: persisted?.id || stepType,
      step_type: stepType,
      status: persisted?.status || "PENDING",
      complete: isComplete(persisted?.status),
      evidence: persisted?.evidence || {},
      journal_entry_id: persisted?.journal_entry_id || null,
      completed_at: persisted?.completed_at || null,
      updated_at: persisted?.updated_at || null,
    };
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = clean(searchParams.get("organizationId") || searchParams.get("organization_id"));
    const entityId = clean(searchParams.get("entityId") || searchParams.get("entity_id"));
    const periodId = clean(searchParams.get("periodId") || searchParams.get("period_id"));

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireView(access);

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: entityId || null,
      periodId: periodId || null,
      request,
      access,
    });
    if (!context.success) return jsonError(context.error, context.status || 400);

    const resolvedEntityId = context.entityId || null;
    const resolvedPeriodId = context.periodId || null;
    if (!resolvedEntityId || !resolvedPeriodId) {
      return NextResponse.json({
        success: true,
        ready: false,
        context: {
          organization_id: context.organizationId,
          entity_id: resolvedEntityId,
          period_id: resolvedPeriodId,
          period_status: context.period?.status || null,
        },
      });
    }

    const periodStart = context.period?.start_date || null;
    const periodEnd = context.period?.end_date || null;
    const periodClosed = ["closed", "locked"].includes(normalizedStatus(context.period?.status));

    let checklist = null;
    if (!periodClosed) {
      checklist = await loadPeriodCloseChecklist({
        organizationId: access.organizationId,
        entityId: resolvedEntityId,
        periodId: resolvedPeriodId,
      });
    }

    const [bankAccountsSource, reconciliationsSource, approvalsSource, reviewsSource, filingsSource, closeStepsSource, closeRunSource] = await Promise.all([
      safePopulation("bank_accounts", () => fetchCompleteFinancePopulation({
        label: "Close-control bank-account population",
        buildQuery: (from, to) => supabaseAdmin
          .from("bank_accounts")
          .select("*")
          .eq("organization_id", access.organizationId)
          .order("id", { ascending: true })
          .range(from, to),
      })),
      safePopulation("finance_bank_reconciliation_runs", () => fetchCompleteFinancePopulation({
        label: "Close-control bank reconciliation population",
        buildQuery: (from, to) => {
          let query = supabaseAdmin
            .from("finance_bank_reconciliation_runs")
            .select("id,bank_account_id,bank_statement_id,reconciliation_date,book_closing_balance,statement_closing_balance,difference_amount,status,notes,created_at,updated_at")
            .eq("organization_id", access.organizationId)
            .eq("entity_id", resolvedEntityId);
          if (periodStart) query = query.gte("reconciliation_date", periodStart);
          if (periodEnd) query = query.lte("reconciliation_date", periodEnd);
          return query.order("reconciliation_date", { ascending: true, nullsFirst: false }).order("id", { ascending: true }).range(from, to);
        },
      })),
      safePopulation("finance_approval_requests", () => fetchCompleteFinancePopulation({
        label: "Close-control approval population",
        buildQuery: (from, to) => supabaseAdmin
          .from("finance_approval_requests")
          .select("id,document_type,document_id,amount,currency_code,assigned_role,status,requested_at,decision_notes")
          .eq("organization_id", access.organizationId)
          .eq("entity_id", resolvedEntityId)
          .eq("period_id", resolvedPeriodId)
          .in("status", OPEN_APPROVAL_STATUSES)
          .order("requested_at", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, to),
      })),
      safePopulation("finance_review_items", () => fetchCompleteFinancePopulation({
        label: "Close-control review population",
        buildQuery: (from, to) => supabaseAdmin
          .from("finance_review_items")
          .select("id,entity_id,period_id,capability_id,record_label,status,priority,due_at,preparer_id,reviewer_id,updated_at")
          .eq("organization_id", access.organizationId)
          .in("status", OPEN_REVIEW_STATUSES)
          .or(`entity_id.is.null,entity_id.eq.${resolvedEntityId}`)
          .or(`period_id.is.null,period_id.eq.${resolvedPeriodId}`)
          .order("due_at", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, to),
      })),
      safePopulation("finance_statutory_filings", () => fetchCompleteFinancePopulation({
        label: "Close-control statutory filing population",
        buildQuery: (from, to) => supabaseAdmin
          .from("finance_statutory_filings")
          .select("id,filing_type,jurisdiction_code,authority_name,due_date,status,submitted_at,notes")
          .eq("organization_id", access.organizationId)
          .eq("entity_id", resolvedEntityId)
          .eq("period_id", resolvedPeriodId)
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, to),
      })),
      safePopulation("finance_period_close_steps", () => fetchCompleteFinancePopulation({
        label: "Close-control period step population",
        buildQuery: (from, to) => supabaseAdmin
          .from("finance_period_close_steps")
          .select("id,step_type,status,journal_entry_id,evidence,completed_at,created_at,updated_at")
          .eq("organization_id", access.organizationId)
          .eq("entity_id", resolvedEntityId)
          .eq("period_id", resolvedPeriodId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      })),
      safeSingle("finance_period_close_runs", async () => {
        const { data, error } = await supabaseAdmin
          .from("finance_period_close_runs")
          .select("id,close_type,status,required_steps,result,closed_at,created_at,updated_at")
          .eq("organization_id", access.organizationId)
          .eq("entity_id", resolvedEntityId)
          .eq("period_id", resolvedPeriodId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data || null;
      }),
    ]);

    const persistedCloseRows = closeStepsSource.rows || [];
    const requiredMonthEndSteps = checklist?.required_steps?.length
      ? checklist.required_steps
      : Array.isArray(closeRunSource.row?.required_steps) && closeRunSource.row.required_steps.length
        ? closeRunSource.row.required_steps.filter((step) => step !== "RETAINED_EARNINGS")
        : DEFAULT_MONTH_END_STEPS;
    const requiredYearEndSteps = checklist?.year_end_steps?.length
      ? checklist.year_end_steps
      : persistedCloseRows.some((row) => row.step_type === "RETAINED_EARNINGS")
        ? ["RETAINED_EARNINGS"]
        : [];

    const monthEndSteps = stepRows(requiredMonthEndSteps, persistedCloseRows);
    const yearEndSteps = stepRows(requiredYearEndSteps, persistedCloseRows);
    const incompleteCloseSteps = monthEndSteps.filter((row) => !row.complete);

    const scopedBankAccounts = (bankAccountsSource.rows || []).filter((row) => accountScopeMatches(row, resolvedEntityId));
    const latestReconciliationByAccount = latestBy(reconciliationsSource.rows || [], "bank_account_id", ["reconciliation_date", "updated_at", "created_at"]);
    const reconciliationAccounts = scopedBankAccounts.map((account) => {
      const reconciliation = latestReconciliationByAccount.get(account.id) || null;
      const difference = amount(reconciliation?.difference_amount);
      const reconciled = Boolean(reconciliation && isComplete(reconciliation.status) && Math.abs(difference) <= EPSILON);
      return {
        bank_account_id: account.id,
        name: accountName(account),
        currency_code: account.currency_code || null,
        reconciliation_id: reconciliation?.id || null,
        reconciliation_date: reconciliation?.reconciliation_date || null,
        status: reconciliation?.status || "MISSING",
        difference,
        covered: Boolean(reconciliation),
        reconciled,
      };
    });
    const coveredAccounts = reconciliationAccounts.filter((row) => row.covered).length;
    const reconciledAccounts = reconciliationAccounts.filter((row) => row.reconciled).length;
    const missingAccounts = reconciliationAccounts.filter((row) => !row.covered);
    const exceptionAccounts = reconciliationAccounts.filter((row) => row.covered && !row.reconciled);
    const reconciliationCoveragePercent = reconciliationAccounts.length
      ? Math.round((reconciledAccounts / reconciliationAccounts.length) * 100)
      : 100;

    const approvals = approvalsSource.rows || [];
    const reviews = reviewsSource.rows || [];
    const filings = (filingsSource.rows || []).filter((row) => !isComplete(row.status));
    const sourceErrors = [bankAccountsSource, reconciliationsSource, approvalsSource, reviewsSource, filingsSource, closeStepsSource, closeRunSource]
      .filter((source) => source.status === "error");

    const blockers = [];
    for (const source of sourceErrors) {
      blockers.push({
        id: `source:${source.source}`,
        kind: "SOURCE",
        rank: 0,
        title: "Accounting truth source unavailable",
        detail: `${source.source}: ${source.error || "Source unavailable"}`,
        count: 1,
        href: null,
      });
    }
    if (missingAccounts.length) {
      blockers.push({ id: "reconciliation:missing", kind: "RECONCILIATION", rank: 10, title: "Bank accounts without period reconciliation", detail: `${missingAccounts.length} active bank account${missingAccounts.length === 1 ? "" : "s"} have no reconciliation in this period.`, count: missingAccounts.length, href: "/finance/bank-reconciliation" });
    }
    if (exceptionAccounts.length) {
      blockers.push({ id: "reconciliation:exceptions", kind: "RECONCILIATION", rank: 12, title: "Bank reconciliations need clearance", detail: `${exceptionAccounts.length} account${exceptionAccounts.length === 1 ? "" : "s"} are not both completed and at zero difference.`, count: exceptionAccounts.length, href: "/finance/bank-reconciliation" });
    }
    if (incompleteCloseSteps.length) {
      blockers.push({ id: "close:steps", kind: "CLOSE_STEP", rank: 20, title: "Governed close steps remain", detail: `${incompleteCloseSteps.length} required month-end step${incompleteCloseSteps.length === 1 ? "" : "s"} remain incomplete.`, count: incompleteCloseSteps.length, href: "/finance/close" });
    }
    if (approvals.length) {
      blockers.push({ id: "controls:approvals", kind: "APPROVAL", rank: 30, title: "Finance approvals remain", detail: `${approvals.length} finance approval${approvals.length === 1 ? "" : "s"} still require a decision.`, count: approvals.length, href: "/finance/work" });
    }
    if (reviews.length) {
      blockers.push({ id: "controls:review", kind: "REVIEW", rank: 35, title: "Accounting review remains open", detail: `${reviews.length} review item${reviews.length === 1 ? "" : "s"} remain in the selected entity/period scope.`, count: reviews.length, href: "/finance/review" });
    }
    if (filings.length) {
      blockers.push({ id: "controls:filings", kind: "STATUTORY", rank: 40, title: "Statutory obligations remain open", detail: `${filings.length} filing${filings.length === 1 ? "" : "s"} remain open for this period.`, count: filings.length, href: "/finance/statutory-filings" });
    }
    blockers.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));

    const integrityComplete = sourceErrors.length === 0 &&
      [bankAccountsSource, reconciliationsSource, approvalsSource, reviewsSource, filingsSource, closeStepsSource]
        .every((source) => source.population?.complete === true);
    const finalReady = !periodClosed && integrityComplete && blockers.length === 0;

    const path = [
      {
        id: "reconciliation",
        label: "Reconciliation coverage",
        state: missingAccounts.length || exceptionAccounts.length ? "ATTENTION" : "CLEAR",
        detail: reconciliationAccounts.length
          ? `${reconciledAccounts}/${reconciliationAccounts.length} active bank accounts reconciled with zero difference.`
          : "No active bank accounts require reconciliation in this scope.",
        href: "/finance/bank-reconciliation",
      },
      {
        id: "close_steps",
        label: "Close execution",
        state: incompleteCloseSteps.length ? "ATTENTION" : "CLEAR",
        detail: `${monthEndSteps.length - incompleteCloseSteps.length}/${monthEndSteps.length} governed month-end steps complete.`,
        href: "/finance/close",
      },
      {
        id: "review",
        label: "Review & approvals",
        state: approvals.length || reviews.length ? "ATTENTION" : "CLEAR",
        detail: `${reviews.length} review · ${approvals.length} approval${approvals.length === 1 ? "" : "s"} open.`,
        href: reviews.length ? "/finance/review" : "/finance/work",
      },
      {
        id: "statutory",
        label: "Statutory clearance",
        state: filings.length ? "ATTENTION" : "CLEAR",
        detail: filings.length ? `${filings.length} filing${filings.length === 1 ? "" : "s"} remain open.` : "No open statutory filing in the selected period.",
        href: "/finance/statutory-filings",
      },
      {
        id: "final",
        label: "Final period lock",
        state: periodClosed ? "CLOSED" : finalReady ? "READY" : "WAITING",
        detail: periodClosed ? "Period is already closed or locked." : finalReady ? "Control tower is clear. Final server close still revalidates the governed runtime." : "Waiting for the control path above to clear.",
        href: null,
      },
    ];

    const sources = {
      bank_accounts: sourceSummary(bankAccountsSource),
      finance_bank_reconciliation_runs: sourceSummary(reconciliationsSource),
      finance_approval_requests: sourceSummary(approvalsSource),
      finance_review_items: sourceSummary(reviewsSource),
      finance_statutory_filings: sourceSummary(filingsSource),
      finance_period_close_steps: sourceSummary(closeStepsSource),
      finance_period_close_runs: sourceSummary(closeRunSource),
    };

    return NextResponse.json({
      success: true,
      ready: true,
      context: {
        organization_id: context.organizationId,
        entity_id: resolvedEntityId,
        period_id: resolvedPeriodId,
        period_start: periodStart,
        period_end: periodEnd,
        period_status: context.period?.status || null,
        currency: context.currency || checklist?.currency_code || null,
      },
      integrity: {
        complete: integrityComplete,
        queue_truth: "SERVER_GENERATED",
        reconciliation_truth: "COMPLETE_POPULATION_PLUS_ACCOUNT_COVERAGE",
        final_authorization: "ATOMIC_PERIOD_CLOSE_RUNTIME",
        sources,
      },
      summary: {
        hard_blockers: blockers.length,
        close_steps_complete: monthEndSteps.length - incompleteCloseSteps.length,
        close_steps_total: monthEndSteps.length,
        reconciliation_coverage_percent: reconciliationCoveragePercent,
        reconciled_bank_accounts: reconciledAccounts,
        active_bank_accounts: reconciliationAccounts.length,
        open_reviews: reviews.length,
        open_approvals: approvals.length,
        open_filings: filings.length,
        final_ready: finalReady,
        period_closed: periodClosed,
      },
      reconciliation: {
        active_accounts: reconciliationAccounts.length,
        covered_accounts: coveredAccounts,
        reconciled_accounts: reconciledAccounts,
        missing_accounts: missingAccounts.length,
        exception_accounts: exceptionAccounts.length,
        coverage_percent: reconciliationCoveragePercent,
        unresolved_difference: exceptionAccounts.reduce((total, row) => total + amount(row.difference), 0),
        accounts: reconciliationAccounts,
      },
      close: {
        run: closeRunSource.row || null,
        steps: monthEndSteps,
        year_end_steps: yearEndSteps,
        month_end_ready: incompleteCloseSteps.length === 0,
      },
      controls: {
        approvals,
        reviews,
        filings,
      },
      blockers,
      path,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error?.message || "Unable to load Finance close control tower";
    const status = /permission denied/i.test(message)
      ? 403
      : /completeness boundary|silently truncated/i.test(message)
        ? 503
        : 500;
    return jsonError(message, status);
  }
}
