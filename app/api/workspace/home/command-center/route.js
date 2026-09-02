export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { generateProfitAndLoss } from "@/lib/finance/reporting/reports/generateProfitAndLoss";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function entityScoped(query, entityId) {
  if (!entityId) return query;
  return query.or(`entity_id.eq.${entityId},entity_id.is.null`);
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function nextDay(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function safe(source, task, fallback = []) {
  try {
    return { source, status: "connected", data: await task(), error: null };
  } catch (error) {
    console.error("HOME_COMMAND_CENTER_SOURCE_FAILED", { source, error });
    return {
      source,
      status: "error",
      data: fallback,
      error: error?.message || "Source unavailable",
    };
  }
}

function homeHref(organizationId, path) {
  return `/workspace/${organizationId}${path}`;
}

function isOpenStatus(value) {
  return ![
    "approved",
    "cancelled",
    "closed",
    "complete",
    "completed",
    "declined",
    "dismissed",
    "expired",
    "fulfilled",
    "paid",
    "rejected",
    "resolved",
    "void",
  ].includes(normalized(value));
}

function priorityWeight(priority) {
  if (priority === "critical") return 0;
  if (priority === "attention") return 1;
  return 2;
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
    const startDate = context.period?.start_date || null;
    const endDate = context.period?.end_date || null;
    const today = new Date().toISOString().slice(0, 10);

    const [
      financeSource,
      approvalsSource,
      inventorySource,
      quotesSource,
      ordersSource,
      timeOffSource,
      swapsSource,
      projectsSource,
      documentsSource,
      complianceIssuesSource,
      obligationsSource,
      servicesSource,
      billingSource,
    ] = await Promise.all([
      safe("finance", async () => {
        if (!resolvedEntityId || !startDate || !endDate) return null;
        return generateProfitAndLoss({
          organizationId: context.organizationId,
          entityId: resolvedEntityId,
          startDate,
          endDate,
        });
      }, null),
      safe("approval_requests", async () => {
        const { data, error } = await supabaseAdmin
          .from("approval_requests")
          .select("*")
          .eq("organization_id", context.organizationId)
          .order("created_at", { ascending: false })
          .limit(250);
        if (error) throw error;
        return data || [];
      }),
      safe("inventory_alerts", async () => {
        let query = supabaseAdmin.from("inventory_alerts").select("*").eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query.order("created_at", { ascending: false }).limit(250);
        if (error) throw error;
        return data || [];
      }),
      safe("commercial_quotations", async () => {
        let query = supabaseAdmin.from("commercial_quotations").select("*").eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query.order("updated_at", { ascending: false }).limit(250);
        if (error) throw error;
        return data || [];
      }),
      safe("sales_orders", async () => {
        let query = supabaseAdmin.from("sales_orders").select("*").eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        if (startDate && endDate) {
          const exclusiveEnd = nextDay(endDate);
          if (exclusiveEnd) query = query.gte("created_at", `${startDate}T00:00:00.000Z`).lt("created_at", `${exclusiveEnd}T00:00:00.000Z`);
        }
        const { data, error } = await query.order("updated_at", { ascending: false }).limit(500);
        if (error) throw error;
        return data || [];
      }),
      safe("staff_time_off_requests", async () => {
        let query = supabaseAdmin.from("staff_time_off_requests").select("*").eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query.order("requested_at", { ascending: false }).limit(250);
        if (error) throw error;
        return data || [];
      }),
      safe("staff_shift_swap_requests", async () => {
        let query = supabaseAdmin.from("staff_shift_swap_requests").select("*").eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query.order("requested_at", { ascending: false }).limit(250);
        if (error) throw error;
        return data || [];
      }),
      safe("projects", async () => {
        let query = supabaseAdmin.from("projects").select("*").eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query.order("updated_at", { ascending: false }).limit(250);
        if (error) throw error;
        return data || [];
      }),
      safe("enterprise_documents", async () => {
        let query = supabaseAdmin.from("enterprise_documents").select("*").eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query.order("updated_at", { ascending: false }).limit(250);
        if (error) throw error;
        return data || [];
      }),
      safe("compliance_issues", async () => {
        let query = supabaseAdmin.from("compliance_issues").select("*").eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query.order("updated_at", { ascending: false }).limit(250);
        if (error) throw error;
        return data || [];
      }),
      safe("compliance_obligations", async () => {
        let query = supabaseAdmin.from("compliance_obligations").select("*").eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query.order("updated_at", { ascending: false }).limit(250);
        if (error) throw error;
        return data || [];
      }),
      safe("organization_services", async () => {
        let query = supabaseAdmin.from("organization_services").select("*").eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query.order("updated_at", { ascending: false }).limit(500);
        if (error) throw error;
        return data || [];
      }),
      safe("service_billing_queue", async () => {
        let query = supabaseAdmin.from("service_billing_queue").select("*").eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query.order("created_at", { ascending: false }).limit(250);
        if (error) throw error;
        return data || [];
      }),
    ]);

    const approvals = (approvalsSource.data || []).filter((row) => isOpenStatus(row.status));
    const inventoryAlerts = (inventorySource.data || []).filter((row) => row.resolved !== true);
    const quotes = quotesSource.data || [];
    const staleQuotes = quotes.filter((row) => {
      const status = normalized(row.status);
      if (!["sent", "accepted"].includes(status)) return false;
      const validUntil = dateOnly(row.valid_until);
      return status === "accepted" && !row.sales_order_id || Boolean(validUntil && validUntil <= today);
    });
    const orders = ordersSource.data || [];
    const openOrders = orders.filter((row) => isOpenStatus(row.status));
    const timeOff = (timeOffSource.data || []).filter((row) => normalized(row.status) === "pending");
    const swaps = (swapsSource.data || []).filter((row) => ["pending_manager", "pending_target", "pending"].includes(normalized(row.status)));
    const projects = projectsSource.data || [];
    const projectRisks = projects.filter((row) => {
      if (!isOpenStatus(row.status)) return false;
      const end = dateOnly(row.end_date || row.planned_end_date);
      return !row.start_date || !end || end < today;
    });
    const documents = documentsSource.data || [];
    const documentReviews = documents.filter((row) => {
      if (!isOpenStatus(row.document_status)) return false;
      const review = dateOnly(row.review_due_at);
      const expiry = dateOnly(row.expiry_date);
      return Boolean((review && review <= today) || (expiry && expiry <= today));
    });
    const complianceIssues = (complianceIssuesSource.data || []).filter((row) => isOpenStatus(row.status));
    const obligations = (obligationsSource.data || []).filter((row) => {
      if (!isOpenStatus(row.status)) return false;
      const due = dateOnly(row.due_date);
      const expiry = dateOnly(row.expiry_date);
      return Boolean((due && due <= today) || (expiry && expiry <= today));
    });
    const services = servicesSource.data || [];
    const unhealthyServices = services.filter((row) => {
      const status = normalized(row.status);
      const health = normalized(row.health);
      return !["active", "enabled", "ready"].includes(status) || ["degraded", "error", "failed", "unhealthy"].includes(health) || numeric(row.total_failures) > 0;
    });
    const billingOpen = (billingSource.data || []).filter((row) => !["completed", "complete", "done"].includes(normalized(row.status)));

    const queue = [];
    approvals.slice(0, 8).forEach((row) => queue.push({ id: `approval:${row.id}`, domain: "Approvals", priority: "attention", title: row.title || row.request_type || "Approval waiting", detail: row.description || row.reference_table || "Approval requires action", status: row.status || "Pending", href: homeHref(context.organizationId, "/administration") }));
    inventoryAlerts.slice(0, 8).forEach((row) => queue.push({ id: `inventory:${row.id}`, domain: "Supply Chain", priority: "attention", title: row.alert_type || "Inventory exception", detail: row.message || row.item_name || "Inventory requires review", status: "Open", href: homeHref(context.organizationId, "/supply-chain") }));
    staleQuotes.slice(0, 6).forEach((row) => queue.push({ id: `quote:${row.id}`, domain: "Commercial", priority: "attention", title: row.quotation_number || "Quotation follow-up", detail: row.customer_name || "Customer quotation needs action", status: row.status || "Review", href: homeHref(context.organizationId, "/commercial") }));
    timeOff.slice(0, 5).forEach((row) => queue.push({ id: `leave:${row.id}`, domain: "People", priority: "review", title: "Time-off request", detail: `${row.start_date || ""}${row.end_date ? ` – ${row.end_date}` : ""}`, status: "Manager review", href: homeHref(context.organizationId, "/people") }));
    swaps.slice(0, 5).forEach((row) => queue.push({ id: `swap:${row.id}`, domain: "People", priority: "review", title: "Shift swap request", detail: row.shift_date || "Workforce request", status: row.status || "Pending", href: homeHref(context.organizationId, "/people") }));
    projectRisks.slice(0, 6).forEach((row) => queue.push({ id: `project:${row.id}`, domain: "Projects", priority: dateOnly(row.end_date) && dateOnly(row.end_date) < today ? "attention" : "review", title: row.name || row.project_name || "Project needs planning", detail: dateOnly(row.end_date) && dateOnly(row.end_date) < today ? `Target date ${dateOnly(row.end_date)} has passed` : "Project schedule is incomplete", status: row.status || "Review", href: homeHref(context.organizationId, "/projects") }));
    documentReviews.slice(0, 5).forEach((row) => queue.push({ id: `document:${row.id}`, domain: "Documents", priority: "review", title: row.document_name || "Controlled document", detail: row.expiry_date ? `Expiry ${dateOnly(row.expiry_date)}` : `Review due ${dateOnly(row.review_due_at)}`, status: "Review", href: homeHref(context.organizationId, "/documents") }));
    complianceIssues.slice(0, 6).forEach((row) => queue.push({ id: `compliance:${row.id}`, domain: "Compliance", priority: ["critical", "high"].includes(normalized(row.severity)) ? "critical" : "attention", title: row.title || "Compliance issue", detail: row.description || row.issue_type || "Remediation required", status: row.status || "Open", href: homeHref(context.organizationId, "/compliance") }));
    obligations.slice(0, 5).forEach((row) => queue.push({ id: `obligation:${row.id}`, domain: "Compliance", priority: normalized(row.criticality) === "critical" ? "critical" : "attention", title: row.title || "Compliance obligation", detail: row.due_date ? `Due ${dateOnly(row.due_date)}` : `Expires ${dateOnly(row.expiry_date)}`, status: row.status || "Due", href: homeHref(context.organizationId, "/compliance") }));
    unhealthyServices.slice(0, 5).forEach((row) => queue.push({ id: `service:${row.id}`, domain: "Services", priority: "attention", title: row.service_id || "Service issue", detail: `${row.health || row.status || "Service requires review"}${numeric(row.total_failures) ? ` · ${numeric(row.total_failures)} failures` : ""}`, status: row.status || "Review", href: homeHref(context.organizationId, "/services") }));
    billingOpen.slice(0, 5).forEach((row) => queue.push({ id: `billing:${row.id}`, domain: "Services", priority: row.last_error ? "attention" : "review", title: "Service billing pending", detail: row.last_error || `Billing attempt ${numeric(row.attempts)}`, status: row.status || "Pending", href: homeHref(context.organizationId, "/services/billing") }));

    queue.sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority));

    const finance = financeSource.data || null;
    const domains = [
      { id: "finance", label: "Finance", count: 0, detail: finance ? `${context.currency || ""} ${numeric(finance.revenue).toLocaleString()} revenue` : "Finance context incomplete", href: homeHref(context.organizationId, "/finance") },
      { id: "operations", label: "Operations", count: 0, detail: "Open the live Operations command center", href: homeHref(context.organizationId, "/operations") },
      { id: "supply-chain", label: "Supply Chain", count: inventoryAlerts.length, detail: `${inventoryAlerts.length} open inventory exceptions`, href: homeHref(context.organizationId, "/supply-chain") },
      { id: "commercial", label: "Commercial", count: staleQuotes.length, detail: `${openOrders.length} open orders · ${staleQuotes.length} quote follow-ups`, href: homeHref(context.organizationId, "/commercial") },
      { id: "people", label: "People", count: timeOff.length + swaps.length, detail: `${timeOff.length} leave · ${swaps.length} swap requests`, href: homeHref(context.organizationId, "/people") },
      { id: "projects", label: "Projects", count: projectRisks.length, detail: `${projectRisks.length} schedule/planning risks`, href: homeHref(context.organizationId, "/projects") },
      { id: "documents", label: "Documents", count: documentReviews.length, detail: `${documentReviews.length} review/expiry items`, href: homeHref(context.organizationId, "/documents") },
      { id: "compliance", label: "Compliance", count: complianceIssues.length + obligations.length, detail: `${complianceIssues.length} issues · ${obligations.length} due obligations`, href: homeHref(context.organizationId, "/compliance") },
      { id: "services", label: "Services", count: unhealthyServices.length + billingOpen.length, detail: `${unhealthyServices.length} service risks · ${billingOpen.length} billing items`, href: homeHref(context.organizationId, "/services") },
    ];

    return NextResponse.json({
      success: true,
      context: {
        organization_id: context.organizationId,
        entity_id: resolvedEntityId,
        period_id: context.periodId || null,
        period_start: startDate,
        period_end: endDate,
        currency: context.currency || null,
      },
      metrics: {
        revenue: finance ? numeric(finance.revenue) : null,
        orders: orders.length,
        approvals: approvals.length,
        attention: queue.filter((row) => row.priority === "critical" || row.priority === "attention").length,
        inventory_alerts: inventoryAlerts.length,
      },
      queue: queue.slice(0, 30),
      domains,
      sources: [financeSource, approvalsSource, inventorySource, quotesSource, ordersSource, timeOffSource, swapsSource, projectsSource, documentsSource, complianceIssuesSource, obligationsSource, servicesSource, billingSource].map((source) => ({ source: source.source, status: source.status, error: source.error })),
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("HOME_COMMAND_CENTER_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Unable to load Home command center" }, { status: 500 });
  }
}
