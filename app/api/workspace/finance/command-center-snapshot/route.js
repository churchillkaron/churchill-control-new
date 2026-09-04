export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { fetchCompleteFinancePopulation } from "@/lib/finance/data/fetchCompleteFinancePopulation";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getWorkspaceItemByWorkspace } from "@/lib/platform/registry/erpRegistry";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const COMPLETE_STATUSES = new Set([
  "complete", "completed", "closed", "done", "passed", "posted", "submitted", "approved",
]);
const OPEN_REVIEW_STATUSES = ["OPEN", "IN_PREPARATION", "READY_FOR_REVIEW", "CHANGES_REQUESTED"];
const OPEN_APPROVAL_STATUSES = ["pending", "PENDING", "requested", "REQUESTED", "open", "OPEN"];

function clean(value) {
  return String(value ?? "").trim();
}

function normalizedStatus(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function isComplete(value) {
  return COMPLETE_STATUSES.has(normalizedStatus(value));
}

function amount(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sum(rows, key) {
  return (rows || []).reduce((total, row) => total + amount(row?.[key]), 0);
}

function isOverdue(value, asOf) {
  if (!value || !asOf) return false;
  return String(value).slice(0, 10) < String(asOf).slice(0, 10);
}

function label(value) {
  return clean(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function financeHref(path) {
  return path.startsWith("/finance/") ? path : `/finance/${path.replace(/^\/+/, "")}`;
}

function approvalHref(row) {
  const kind = normalizedStatus(row?.document_type);
  if (kind.includes("vendor") || kind.includes("supplier") || kind.includes("bill")) return financeHref("vendor-bills");
  if (kind.includes("customer") || kind.includes("receivable") || kind.includes("invoice")) return financeHref("customer-invoices");
  if (kind.includes("journal")) return financeHref("journals");
  return financeHref("audit-trail");
}

function reviewHref(row) {
  const capability = getWorkspaceItemByWorkspace("finance", row?.capability_id);
  return capability?.route || financeHref(clean(row?.capability_id).replace(/_/g, "-"));
}

function queuePriorityRank(item) {
  if (item?.priority === "attention") return 0;
  if (item?.priority === "review") return 1;
  return 2;
}

async function safe(source, task, fallback) {
  try {
    return { source, status: "connected", data: await task(), error: null };
  } catch (error) {
    console.error("FINANCE_COMMAND_CENTER_SNAPSHOT_SOURCE_FAILED", { source, error });
    return { source, status: "error", data: fallback, error: error?.message || "Source unavailable" };
  }
}

async function safePopulation(source, buildQuery, fallback = []) {
  try {
    const population = await fetchCompleteFinancePopulation({ buildQuery, label: source });
    return { source, status: "connected", data: population.rows, error: null, population };
  } catch (error) {
    console.error("FINANCE_COMMAND_CENTER_SNAPSHOT_POPULATION_FAILED", { source, error });
    return { source, status: "error", data: fallback, error: error?.message || "Population unavailable", population: null };
  }
}

function aggregateSource(source) {
  return {
    source,
    status: "connected",
    data: [],
    error: null,
    population: { complete: true, mode: "database_aggregate" },
  };
}

function sourceView(source) {
  return {
    status: source.status,
    error: source.error,
    population: source.population || null,
  };
}

function metricNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadExactFallback(context, resolvedEntityId, resolvedPeriodId, periodStart, periodEnd) {
  const [receivablesSource, payablesSource, approvalsSource, reconciliationsSource, filingsSource, reviewItemsSource, engagementsSource] = await Promise.all([
    safePopulation("accounts_receivable", (from, to) => supabaseAdmin
      .from("accounts_receivable")
      .select("id, customer_invoice_id, outstanding_balance, due_date, status, created_at")
      .eq("organization_id", context.organizationId)
      .eq("entity_id", resolvedEntityId)
      .eq("period_id", resolvedPeriodId)
      .gt("outstanding_balance", 0)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to)),
    safePopulation("vendor_invoices", (from, to) => {
      let query = supabaseAdmin
        .from("vendor_invoices")
        .select("id, invoice_number, vendor_party_id, outstanding_amount, due_date, status, approval_status, invoice_date, created_at")
        .eq("organization_id", context.organizationId)
        .eq("entity_id", resolvedEntityId)
        .gt("outstanding_amount", 0);
      if (periodStart) query = query.gte("invoice_date", periodStart);
      if (periodEnd) query = query.lte("invoice_date", periodEnd);
      return query.order("due_date", { ascending: true, nullsFirst: false }).order("id", { ascending: true }).range(from, to);
    }),
    safePopulation("finance_approval_requests", (from, to) => supabaseAdmin
      .from("finance_approval_requests")
      .select("id, document_type, document_id, amount, currency_code, assigned_role, status, requested_at, decision_notes")
      .eq("organization_id", context.organizationId)
      .eq("entity_id", resolvedEntityId)
      .eq("period_id", resolvedPeriodId)
      .in("status", OPEN_APPROVAL_STATUSES)
      .order("requested_at", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to)),
    safePopulation("finance_bank_reconciliation_runs", (from, to) => {
      let query = supabaseAdmin
        .from("finance_bank_reconciliation_runs")
        .select("id, bank_account_id, bank_statement_id, reconciliation_date, book_closing_balance, statement_closing_balance, difference_amount, status, notes, created_at")
        .eq("organization_id", context.organizationId)
        .eq("entity_id", resolvedEntityId);
      if (periodStart) query = query.gte("reconciliation_date", periodStart);
      if (periodEnd) query = query.lte("reconciliation_date", periodEnd);
      return query.order("reconciliation_date", { ascending: false, nullsFirst: false }).order("id", { ascending: true }).range(from, to);
    }),
    safePopulation("finance_statutory_filings", (from, to) => supabaseAdmin
      .from("finance_statutory_filings")
      .select("id, filing_type, jurisdiction_code, authority_name, period_start, period_end, due_date, submission_reference, submitted_at, status, notes")
      .eq("organization_id", context.organizationId)
      .eq("entity_id", resolvedEntityId)
      .eq("period_id", resolvedPeriodId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to)),
    safePopulation("finance_review_items", (from, to) => supabaseAdmin
      .from("finance_review_items")
      .select("id, entity_id, period_id, capability_id, record_key, record_type, record_label, status, priority, due_at, preparer_id, reviewer_id, updated_at")
      .eq("organization_id", context.organizationId)
      .in("status", OPEN_REVIEW_STATUSES)
      .or(`entity_id.is.null,entity_id.eq.${resolvedEntityId}`)
      .or(`period_id.is.null,period_id.eq.${resolvedPeriodId}`)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)),
    safePopulation("accounting_engagements", (from, to) => supabaseAdmin
      .from("accounting_engagements")
      .select("id, organization_id, service_package, status, bookkeeping_enabled, vat_enabled, payroll_enabled, tax_enabled, reporting_enabled, audit_enabled, renewal_date, year_end_date, created_at")
      .eq("accounting_firm_id", context.organizationId)
      .in("status", ["active", "ACTIVE", "enabled", "ENABLED"])
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)),
  ]);

  const exactSources = [receivablesSource, payablesSource, approvalsSource, reconciliationsSource, filingsSource, reviewItemsSource, engagementsSource];
  const incomplete = exactSources.find(source => source.status !== "connected" || source.population?.complete !== true);
  if (incomplete) {
    throw new Error(`Finance exact fallback could not prove a complete ${incomplete.source} population: ${incomplete.error || "population incomplete"}`);
  }

  const receivables = receivablesSource.data || [];
  const payables = payablesSource.data || [];
  const approvals = approvalsSource.data || [];
  const reconciliations = reconciliationsSource.data || [];
  const filings = filingsSource.data || [];
  const reviewItems = reviewItemsSource.data || [];
  const engagements = engagementsSource.data || [];
  const openReconciliations = reconciliations.filter(row => !isComplete(row.status) || Math.abs(amount(row.difference_amount)) > 0.000001);
  const openFilings = filings.filter(row => !isComplete(row.status));
  const reviewAsOf = periodEnd || new Date().toISOString();

  return {
    metrics: {
      receivables: { count: receivables.length, amount: sum(receivables, "outstanding_balance"), overdue: receivables.filter(row => isOverdue(row.due_date, periodEnd)).length },
      payables: { count: payables.length, amount: sum(payables, "outstanding_amount"), overdue: payables.filter(row => isOverdue(row.due_date, periodEnd)).length },
      approvals: { count: approvals.length },
      reconciliation: { count: openReconciliations.length, difference: sum(openReconciliations, "difference_amount") },
      filings: { count: openFilings.length, overdue: openFilings.filter(row => isOverdue(row.due_date, periodEnd)).length },
      review: {
        count: reviewItems.length,
        ready: reviewItems.filter(row => row.status === "READY_FOR_REVIEW").length,
        changes_requested: reviewItems.filter(row => row.status === "CHANGES_REQUESTED").length,
        overdue: reviewItems.filter(row => isOverdue(row.due_at, reviewAsOf)).length,
      },
      practice: { active_clients: engagements.length },
    },
    samples: {
      approvals: approvals.slice(0, 5),
      reconciliations: openReconciliations.slice(0, 5),
      filings: openFilings.slice(0, 5),
      reviews: reviewItems.slice(0, 12),
      engagements: engagements.slice(0, 8),
    },
    sources: { receivablesSource, payablesSource, approvalsSource, reconciliationsSource, filingsSource, reviewItemsSource, engagementsSource },
  };
}

function normalizeAggregate(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Finance aggregate returned no snapshot");
  return {
    metrics: {
      receivables: {
        count: metricNumber(raw.receivables?.count),
        amount: metricNumber(raw.receivables?.amount),
        overdue: metricNumber(raw.receivables?.overdue),
      },
      payables: {
        count: metricNumber(raw.payables?.count),
        amount: metricNumber(raw.payables?.amount),
        overdue: metricNumber(raw.payables?.overdue),
      },
      approvals: { count: metricNumber(raw.approvals?.count) },
      reconciliation: { count: metricNumber(raw.reconciliation?.count), difference: metricNumber(raw.reconciliation?.difference) },
      filings: { count: metricNumber(raw.filings?.count), overdue: metricNumber(raw.filings?.overdue) },
      review: {
        count: metricNumber(raw.review?.count),
        ready: metricNumber(raw.review?.ready),
        changes_requested: metricNumber(raw.review?.changes_requested),
        overdue: metricNumber(raw.review?.overdue),
      },
      practice: { active_clients: metricNumber(raw.practice?.active_clients) },
    },
    samples: {
      approvals: Array.isArray(raw.samples?.approvals) ? raw.samples.approvals : [],
      reconciliations: Array.isArray(raw.samples?.reconciliations) ? raw.samples.reconciliations : [],
      filings: Array.isArray(raw.samples?.filings) ? raw.samples.filings : [],
      reviews: Array.isArray(raw.samples?.reviews) ? raw.samples.reviews : [],
      engagements: Array.isArray(raw.samples?.engagements) ? raw.samples.engagements : [],
    },
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const entityId = clean(url.searchParams.get("entityId") || url.searchParams.get("entity_id"));
    const periodId = clean(url.searchParams.get("periodId") || url.searchParams.get("period_id"));

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: entityId || null,
      periodId: periodId || null,
      request,
      access,
    });
    if (!context.success) {
      return NextResponse.json({ success: false, error: context.error }, { status: context.status || 400 });
    }

    const resolvedEntityId = context.entityId || null;
    const resolvedPeriodId = context.periodId || null;
    const periodStart = context.period?.start_date || null;
    const periodEnd = context.period?.end_date || null;

    if (!resolvedEntityId || !resolvedPeriodId) {
      return NextResponse.json({
        success: true,
        ready: false,
        error: null,
        context: {
          organization_id: context.organizationId,
          entity_id: resolvedEntityId,
          period_id: resolvedPeriodId,
          period_start: periodStart,
          period_end: periodEnd,
          period_status: context.period?.status || null,
          currency: context.currency || null,
        },
        metrics: {},
        queue: [],
        close: { run: null, steps: [], completed: 0, total: 0, progress: 0 },
        practice: { active_clients: 0, clients: [] },
        recent_work: [],
        sources: {},
        integrity: { complete: false, metrics_source: null, aggregate_warning: null },
      });
    }

    const [aggregateSourceResult, closeRunSource, closeStepsSource, recentWorkSource] = await Promise.all([
      safe("finance_command_center_metrics", async () => {
        const { data, error } = await supabaseAdmin.rpc("finance_command_center_metrics", {
          p_organization_id: context.organizationId,
          p_entity_id: resolvedEntityId,
          p_period_id: resolvedPeriodId,
          p_period_start: periodStart,
          p_period_end: periodEnd,
        });
        if (error) throw error;
        return normalizeAggregate(data);
      }, null),
      safe("finance_period_close_runs", async () => {
        const { data, error } = await supabaseAdmin
          .from("finance_period_close_runs")
          .select("id, close_type, status, required_steps, result, closed_at, created_at, updated_at")
          .eq("organization_id", context.organizationId)
          .eq("entity_id", resolvedEntityId)
          .eq("period_id", resolvedPeriodId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data || null;
      }, null),
      safePopulation("finance_period_close_steps", (from, to) => supabaseAdmin
        .from("finance_period_close_steps")
        .select("id, step_type, status, journal_entry_id, evidence, completed_at, created_at, updated_at")
        .eq("organization_id", context.organizationId)
        .eq("entity_id", resolvedEntityId)
        .eq("period_id", resolvedPeriodId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to), []),
      safe("accounting_engagement_work_items", async () => {
        const { data, error } = await supabaseAdmin
          .from("accounting_engagement_work_items")
          .select("id,organization_id,run_id,title,status,required_role,due_at,completed_at,updated_at")
          .eq("accounting_firm_id", context.organizationId)
          .order("updated_at", { ascending: false })
          .limit(12);
        if (error) throw error;
        return data || [];
      }, []),
    ]);

    let snapshot;
    let metricsSourceMode;
    let aggregateWarning = null;
    let metricSources;

    if (aggregateSourceResult.status === "connected" && aggregateSourceResult.data) {
      snapshot = aggregateSourceResult.data;
      metricsSourceMode = "database_aggregate";
      metricSources = {
        receivablesSource: aggregateSource("accounts_receivable"),
        payablesSource: aggregateSource("vendor_invoices"),
        approvalsSource: aggregateSource("finance_approval_requests"),
        reconciliationsSource: aggregateSource("finance_bank_reconciliation_runs"),
        filingsSource: aggregateSource("finance_statutory_filings"),
        reviewItemsSource: aggregateSource("finance_review_items"),
        engagementsSource: aggregateSource("accounting_engagements"),
      };
    } else {
      aggregateWarning = aggregateSourceResult.error || "Database aggregate unavailable";
      snapshot = await loadExactFallback(context, resolvedEntityId, resolvedPeriodId, periodStart, periodEnd);
      metricsSourceMode = "complete_population_fallback";
      metricSources = snapshot.sources;
    }

    const approvals = snapshot.samples.approvals || [];
    const openReconciliations = snapshot.samples.reconciliations || [];
    const openFilings = snapshot.samples.filings || [];
    const reviewItems = snapshot.samples.reviews || [];
    const engagements = snapshot.samples.engagements || [];
    const closeRun = closeRunSource.data || null;
    const closeSteps = closeStepsSource.data || [];
    const completedCloseSteps = closeSteps.filter(row => isComplete(row.status)).length;
    const closeTotal = closeSteps.length;
    const closeProgress = closeTotal ? Math.round((completedCloseSteps / closeTotal) * 100) : isComplete(closeRun?.status) ? 100 : 0;

    const recentWorkRows = recentWorkSource.data || [];
    const clientIds = [...new Set([
      ...engagements.map(row => row.organization_id),
      ...recentWorkRows.map(row => row.organization_id),
    ].filter(Boolean))];
    let organizationMap = new Map();
    let profileMap = new Map();
    if (clientIds.length) {
      const [{ data: organizations, error: organizationsError }, { data: profiles, error: profilesError }] = await Promise.all([
        supabaseAdmin.from("organizations").select("id, name").in("id", clientIds),
        supabaseAdmin
          .from("accounting_client_profiles")
          .select("organization_id, assigned_accountant_name, assigned_reviewer_name, status")
          .eq("accounting_firm_id", context.organizationId)
          .in("organization_id", clientIds),
      ]);
      if (organizationsError) throw organizationsError;
      if (profilesError) throw profilesError;
      organizationMap = new Map((organizations || []).map(row => [row.id, row]));
      profileMap = new Map((profiles || []).map(row => [row.organization_id, row]));
    }

    const practiceClients = engagements.map(engagement => {
      const organization = organizationMap.get(engagement.organization_id) || {};
      const profile = profileMap.get(engagement.organization_id) || {};
      return {
        organization_id: engagement.organization_id,
        name: organization.name || "Client organization",
        service_package: engagement.service_package || null,
        assigned_accountant: profile.assigned_accountant_name || null,
        assigned_reviewer: profile.assigned_reviewer_name || null,
        renewal_date: engagement.renewal_date || null,
        year_end_date: engagement.year_end_date || null,
        status: profile.status || engagement.status || null,
      };
    });

    const clientNameMap = new Map(clientIds.map(id => [id, organizationMap.get(id)?.name || "Client organization"]));
    const recentWork = recentWorkRows.slice(0, 8).map(row => ({
      id: row.id,
      organization_id: row.organization_id,
      run_id: row.run_id,
      client_name: clientNameMap.get(row.organization_id) || "Client organization",
      title: row.title || "Accounting procedure",
      status: row.status || "Open",
      required_role: row.required_role || null,
      due_at: row.due_at || null,
      completed_at: row.completed_at || null,
      updated_at: row.updated_at || null,
      href: financeHref("work"),
    }));

    const queue = [];
    const reviewAsOf = periodEnd || new Date().toISOString();
    reviewItems.forEach(row => {
      const overdue = isOverdue(row.due_at, reviewAsOf);
      const needsChanges = row.status === "CHANGES_REQUESTED";
      const ready = row.status === "READY_FOR_REVIEW";
      const urgent = ["URGENT", "HIGH"].includes(clean(row.priority).toUpperCase());
      queue.push({
        id: `review:${row.id}`,
        kind: "review",
        priority: overdue || needsChanges || ready || urgent ? "attention" : "review",
        title: needsChanges
          ? `Changes requested · ${row.record_label || label(row.capability_id)}`
          : ready
            ? `Ready for review · ${row.record_label || label(row.capability_id)}`
            : `Review · ${row.record_label || label(row.capability_id)}`,
        detail: [label(row.capability_id), row.due_at ? `${overdue ? "Overdue" : "Due"} ${String(row.due_at).slice(0, 10)}` : null, row.priority && row.priority !== "NORMAL" ? label(row.priority) : null].filter(Boolean).join(" · "),
        status: row.status,
        href: reviewHref(row),
      });
    });

    closeSteps.filter(row => !isComplete(row.status)).slice(0, 8).forEach(row => queue.push({
      id: `close:${row.id}`,
      kind: "close",
      priority: "review",
      title: label(row.step_type || "Close step"),
      detail: "Period close checklist",
      status: row.status || "Open",
      href: financeHref("close"),
    }));

    openReconciliations.forEach(row => queue.push({
      id: `reconciliation:${row.id}`,
      kind: "reconciliation",
      priority: Math.abs(amount(row.difference_amount)) > 0.000001 ? "attention" : "review",
      title: "Bank reconciliation",
      detail: `Difference ${amount(row.difference_amount)}`,
      status: row.status || "Open",
      href: financeHref("bank-reconciliation"),
    }));

    approvals.forEach(row => queue.push({
      id: `approval:${row.id}`,
      kind: "approval",
      priority: "attention",
      title: `Approve ${label(row.document_type || "finance item")}`,
      detail: [row.currency_code, amount(row.amount) || null, row.assigned_role].filter(Boolean).join(" · "),
      status: row.status || "Pending",
      href: approvalHref(row),
    }));

    openFilings.forEach(row => queue.push({
      id: `filing:${row.id}`,
      kind: "filing",
      priority: isOverdue(row.due_date, periodEnd || new Date().toISOString()) ? "attention" : "review",
      title: label(row.filing_type || "Statutory filing"),
      detail: [row.authority_name, row.due_date ? `Due ${row.due_date}` : null].filter(Boolean).join(" · "),
      status: row.status || "Open",
      href: financeHref("statutory-filings"),
    }));

    const rankedQueue = queue
      .map((item, index) => ({ item, index }))
      .sort((a, b) => queuePriorityRank(a.item) - queuePriorityRank(b.item) || a.index - b.index)
      .map(({ item }) => item)
      .slice(0, 14);

    const metricStatus = "connected";
    const metrics = {
      receivables: { ...snapshot.metrics.receivables, source_status: metricStatus, population_complete: true },
      payables: { ...snapshot.metrics.payables, source_status: metricStatus, population_complete: true },
      approvals: { ...snapshot.metrics.approvals, source_status: metricStatus, population_complete: true },
      reconciliation: { ...snapshot.metrics.reconciliation, source_status: metricStatus, population_complete: true },
      filings: { ...snapshot.metrics.filings, source_status: metricStatus, population_complete: true },
      review: { ...snapshot.metrics.review, source_status: metricStatus, population_complete: true },
      close: {
        completed: completedCloseSteps,
        total: closeTotal,
        progress: closeProgress,
        status: closeRun?.status || (closeTotal ? "in_progress" : "not_started"),
        source_status: closeRunSource.status === "error" || closeStepsSource.status === "error" ? "error" : "connected",
        population_complete: closeStepsSource.population?.complete === true,
      },
    };

    const sources = {
      accounts_receivable: sourceView(metricSources.receivablesSource),
      vendor_invoices: sourceView(metricSources.payablesSource),
      finance_approval_requests: sourceView(metricSources.approvalsSource),
      finance_bank_reconciliation_runs: sourceView(metricSources.reconciliationsSource),
      finance_period_close_runs: sourceView(closeRunSource),
      finance_period_close_steps: sourceView(closeStepsSource),
      finance_statutory_filings: sourceView(metricSources.filingsSource),
      accounting_engagements: sourceView(metricSources.engagementsSource),
      finance_review_items: sourceView(metricSources.reviewItemsSource),
      accounting_engagement_work_items: sourceView(recentWorkSource),
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
        currency: context.currency || null,
      },
      metrics,
      close: {
        run: closeRun,
        steps: closeSteps.map(row => ({
          id: row.id,
          step_type: row.step_type,
          label: label(row.step_type || "Close step"),
          status: row.status,
          complete: isComplete(row.status),
          completed_at: row.completed_at,
          has_evidence: Boolean(row.evidence && Object.keys(row.evidence || {}).length),
        })),
        completed: completedCloseSteps,
        total: closeTotal,
        progress: closeProgress,
      },
      queue: rankedQueue,
      practice: {
        active_clients: snapshot.metrics.practice.active_clients,
        clients: practiceClients,
        source_status: metricStatus,
        population_complete: true,
      },
      recent_work: recentWork,
      sources,
      integrity: {
        complete: true,
        metrics_source: metricsSourceMode,
        aggregate_warning: aggregateWarning,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("FINANCE_COMMAND_CENTER_SNAPSHOT_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Unable to load Finance command center snapshot" }, { status: 503 });
  }
}
