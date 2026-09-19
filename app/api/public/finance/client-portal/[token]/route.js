export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { createControlledDocument } from "@/lib/documents/runtime/DocumentControlRuntime";
import { resolveFinanceClientPortalGrant } from "@/lib/finance/practice/FinanceClientPortalGrant";
import { loadFinanceClientPortalProjection } from "@/lib/finance/practice/FinanceClientPortalProjection";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { fetchCompleteFinancePopulation } from "@/lib/finance/data/fetchCompleteFinancePopulation";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["image/"];
const ALLOWED_MIME_TYPES = new Set(["application/pdf","text/csv","text/plain","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const OPEN_REQUEST_STATUSES = ["SENT","VIEWED","IN_PROGRESS","SUBMITTED","CHANGES_REQUESTED"];
function clean(value) { return String(value ?? "").trim(); }
function jsonError(error, status = 400, details = undefined) { return NextResponse.json({ success: false, error, ...(details ? { details } : {}) }, { status }); }
function allowedFile(file) { const mime = clean(file?.type).toLowerCase(); return !mime || ALLOWED_MIME_TYPES.has(mime) || ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix)); }
function verificationCategories(item) { const verification = item?.metadata?.system_verification; if (verification?.mode !== "DOCUMENT_CATEGORIES") return []; return (Array.isArray(verification.categories) ? verification.categories : []).map((category) => ({ key: clean(category?.key).toLowerCase(), label: clean(category?.label || category?.key), min_count: Math.max(1, Number(category?.min_count || 1)) })).filter((category) => category.key); }
function coverage(categories, evidence) { return categories.map((category) => { const count = evidence.filter((row) => row.evidence_category === category.key).length; return { ...category, linked_count: count, missing_count: Math.max(0, category.min_count - count), satisfied: count >= category.min_count }; }); }
function chunks(values, size = 200) { const rows = Array.isArray(values) ? values : []; const out = []; for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size)); return out; }
async function completeByIds({ ids, label, buildQuery }) { const all = []; for (const batch of chunks([...new Set((ids || []).filter(Boolean))])) { const result = await fetchCompleteFinancePopulation({ label: `${label} batch`, buildQuery: (from, to) => buildQuery(batch, from, to) }); all.push(...(result.rows || [])); } return all; }

async function loadPortal(token, { markViewed = true } = {}) {
  const grant = await resolveFinanceClientPortalGrant(token, { markViewed });
  if (!grant) return { error: "This accounting client portal link is invalid or expired", status: 404 };
  const { data: engagement, error: engagementError } = await supabaseAdmin.from("accounting_engagements").select("id,accounting_firm_id,organization_id,entity_id,service_package,status,vat_enabled,tax_enabled,bookkeeping_enabled,payroll_enabled,reporting_enabled,accounting_standard,vat_frequency,year_end_date").eq("id", grant.engagement_id).eq("accounting_firm_id", grant.accounting_firm_id).eq("organization_id", grant.organization_id).maybeSingle();
  if (engagementError) throw engagementError;
  if (!engagement) return { error: "Accounting engagement is no longer available", status: 404 };
  return { grant, engagement };
}

async function loadRequests(context) {
  const runPopulation = await fetchCompleteFinancePopulation({
    label: "Client portal active request runs",
    buildQuery: (from, to) => supabaseAdmin.from("accounting_engagement_runs")
      .select("id,engagement_id,organization_id,entity_id,period_id,status,locked_at,due_at")
      .eq("accounting_firm_id", context.grant.accounting_firm_id)
      .eq("engagement_id", context.engagement.id)
      .order("due_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to),
  });
  const openRuns = (runPopulation.rows || []).filter((run) => !run.locked_at);
  const runIds = openRuns.map((run) => run.id);
  if (!runIds.length) return [];

  const requests = await completeByIds({
    ids: runIds,
    label: "Client portal open requests",
    buildQuery: (batch, from, to) => supabaseAdmin.from("accounting_client_requests")
      .select("id,run_id,work_item_id,title,instructions,status,due_at,sent_at,submitted_at,client_response,updated_at")
      .eq("accounting_firm_id", context.grant.accounting_firm_id)
      .eq("organization_id", context.grant.organization_id)
      .in("run_id", batch)
      .in("status", OPEN_REQUEST_STATUSES)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to),
  });
  requests.sort((a, b) => {
    const left = a.due_at ? Date.parse(a.due_at) : Number.POSITIVE_INFINITY;
    const right = b.due_at ? Date.parse(b.due_at) : Number.POSITIVE_INFINITY;
    return left - right || String(a.id).localeCompare(String(b.id));
  });

  const itemIds = [...new Set(requests.map((row) => row.work_item_id).filter(Boolean))];
  const items = itemIds.length ? await completeByIds({
    ids: itemIds,
    label: "Client portal request work items",
    buildQuery: (batch, from, to) => supabaseAdmin.from("accounting_engagement_work_items")
      .select("id,run_id,title,work_type,capability_id,metadata,status")
      .eq("accounting_firm_id", context.grant.accounting_firm_id)
      .in("id", batch)
      .order("id", { ascending: true })
      .range(from, to),
  }) : [];
  const itemMap = new Map(items.map((row) => [row.id, row]));
  const links = itemIds.length ? await completeByIds({
    ids: itemIds,
    label: "Client portal request evidence",
    buildQuery: (batch, from, to) => supabaseAdmin.from("accounting_work_program_evidence_links")
      .select("id,work_item_id,document_id,evidence_category,status,linked_at,metadata")
      .eq("accounting_firm_id", context.grant.accounting_firm_id)
      .in("work_item_id", batch)
      .eq("status", "ACTIVE")
      .order("id", { ascending: true })
      .range(from, to),
  }) : [];
  const evidenceByItem = new Map();
  for (const row of links) { const rows = evidenceByItem.get(row.work_item_id) || []; rows.push(row); evidenceByItem.set(row.work_item_id, rows); }

  return requests.map((requestRow) => {
    const item = itemMap.get(requestRow.work_item_id) || null;
    const evidence = evidenceByItem.get(requestRow.work_item_id) || [];
    const categories = verificationCategories(item);
    const evidenceCoverage = coverage(categories, evidence);
    return { ...requestRow, item: item ? { id: item.id, title: item.title, work_type: item.work_type, capability_id: item.capability_id } : null, categories: evidenceCoverage, evidence_count: evidence.length, ready_to_submit: evidence.length > 0 && (evidenceCoverage.length === 0 || evidenceCoverage.every((row) => row.satisfied)) };
  });
}

async function exactRequestContext(context, requestId) {
  const { data: requestRow, error } = await supabaseAdmin.from("accounting_client_requests").select("*").eq("id", requestId).eq("accounting_firm_id", context.grant.accounting_firm_id).eq("organization_id", context.grant.organization_id).maybeSingle();
  if (error) throw error; if (!requestRow) return { error: "Client request not found", status: 404 };
  const [{ data: run, error: runError }, { data: item, error: itemError }] = await Promise.all([
    supabaseAdmin.from("accounting_engagement_runs").select("id,engagement_id,organization_id,entity_id,period_id,locked_at,status").eq("id", requestRow.run_id).eq("accounting_firm_id", context.grant.accounting_firm_id).maybeSingle(),
    supabaseAdmin.from("accounting_engagement_work_items").select("id,run_id,title,work_type,capability_id,metadata,status").eq("id", requestRow.work_item_id).eq("accounting_firm_id", context.grant.accounting_firm_id).maybeSingle(),
  ]);
  if (runError) throw runError; if (itemError) throw itemError;
  if (!run || !item || run.engagement_id !== context.engagement.id || run.locked_at) return { error: "Client request is outside this active engagement", status: 409 };
  if (item.work_type !== "CLIENT_REQUEST" || item.capability_id !== "documents") return { error: "This request does not accept document evidence", status: 409 };
  return { requestRow, run, item };
}

async function loadEvidence(context) {
  const { data, error } = await supabaseAdmin.from("accounting_work_program_evidence_links").select("id,document_id,evidence_category,status,linked_at").eq("accounting_firm_id", context.requestRow.accounting_firm_id).eq("run_id", context.run.id).eq("work_item_id", context.item.id).eq("status", "ACTIVE").order("linked_at", { ascending: false });
  if (error) throw error; return data || [];
}

async function audit(context, action, metadata = {}) {
  const { error } = await supabaseAdmin.from("organization_audit_logs").insert({ organization_id: context.grant.accounting_firm_id, entity_type: "accounting_client_portal", entity_id: String(context.grant.id), action, metadata: { client_organization_id: context.grant.organization_id, engagement_id: context.engagement.id, general_erp_access: false, ...metadata }, actor_email: context.grant.client_email || null });
  if (error) throw error;
}

export async function GET(request, { params }) {
  try {
    const { token } = await params; const context = await loadPortal(clean(token)); if (context.error) return jsonError(context.error, context.status);
    const [requests, organizationResult, projection] = await Promise.all([
      loadRequests(context),
      supabaseAdmin.from("organizations").select("name").eq("id", context.grant.organization_id).maybeSingle(),
      loadFinanceClientPortalProjection({ grant: context.grant, engagement: context.engagement, markMessagesRead: true }),
    ]);
    if (organizationResult.error) throw organizationResult.error;
    const outstanding = (projection.invoices || []).reduce((sum, row) => sum + Number(row.outstanding_amount || 0), 0);
    const pendingApprovals = (projection.approvals || []).filter((row) => ["PENDING","SENT","VIEWED"].includes(String(row.status || "").toUpperCase())).length;
    const upcomingFilings = (projection.filings || []).filter((row) => !["SUBMITTED","FILED","PAID","CLOSED"].includes(String(row.status || "").toUpperCase())).length;
    const workStatus = { ...projection.work_status, overall: requests.length ? "WAITING_FOR_YOU" : projection.work_status?.overall || "WITH_ACCOUNTANT", waiting_for_you: requests.length };
    await audit(context, "ACCOUNTING_CLIENT_PORTAL_VIEWED", { open_requests: requests.length });
    return NextResponse.json({
      success: true,
      portal: {
        firm_name: projection.firm_name,
        client_name: organizationResult.data?.name || context.grant.client_name || "Client",
        service_package: context.engagement.service_package || "Accounting engagement",
        engagement_status: context.engagement.status || null,
        expires_at: context.grant.expires_at,
        general_erp_access: false,
      },
      summary: { open_requests: requests.length, documents: projection.documents.length, messages: projection.message_meta?.total ?? projection.messages.length, invoices: projection.invoices.length, outstanding_amount: outstanding, pending_approvals: pendingApprovals, upcoming_filings: upcomingFilings },
      profile: projection.profile,
      contacts: projection.contacts,
      work_status: workStatus,
      requests,
      documents: projection.documents,
      messages: projection.messages,
      message_meta: projection.message_meta,
      invoices: projection.invoices,
      payments: projection.payments,
      filings: projection.filings,
      approvals: projection.approvals,
    });
  } catch (error) { return jsonError(error?.message || "Unable to load accounting client portal", 500); }
}

export async function POST(request, { params }) {
  try {
    const { token } = await params; const portal = await loadPortal(clean(token)); if (portal.error) return jsonError(portal.error, portal.status);
    const form = await request.formData(); const action = clean(form.get("action")).toLowerCase();
    if (action === "message") {
      const body = clean(form.get("message") || form.get("body"));
      if (!body) return jsonError("Message is required", 400);
      if (body.length > 4000) return jsonError("Message must be 4,000 characters or fewer", 400);
      const now = new Date().toISOString();
      const { data: message, error: messageError } = await supabaseAdmin.from("accounting_client_portal_messages").insert({
        accounting_firm_id: portal.grant.accounting_firm_id,
        organization_id: portal.grant.organization_id,
        engagement_id: portal.engagement.id,
        portal_grant_id: portal.grant.id,
        sender_type: "CLIENT",
        sender_name: portal.grant.client_name || null,
        sender_email: portal.grant.client_email || null,
        body,
        read_by_client_at: now,
        metadata: { source: "accounting_client_portal" },
      }).select("id,sender_type,sender_name,sender_email,body,created_at").single();
      if (messageError) throw messageError;
      await audit(portal, "ACCOUNTING_CLIENT_PORTAL_MESSAGE_SENT", { message_id: message.id });
      return NextResponse.json({ success: true, message }, { status: 201 });
    }
    const requestId = clean(form.get("requestId") || form.get("request_id")); if (!requestId) return jsonError("requestId is required");
    const exact = await exactRequestContext(portal, requestId); if (exact.error) return jsonError(exact.error, exact.status); const context = { ...portal, ...exact };
    const categories = verificationCategories(context.item);
    if (action === "upload") {
      const file = form.get("file"); const evidenceCategory = clean(form.get("evidenceCategory") || form.get("evidence_category")).toLowerCase();
      if (!file || typeof file.arrayBuffer !== "function") return jsonError("File required"); if (Number(file.size || 0) <= 0 || Number(file.size || 0) > MAX_FILE_BYTES) return jsonError("File must be between 1 byte and 25 MB", 413); if (!allowedFile(file)) return jsonError("Unsupported evidence file type", 415);
      const category = categories.find((row) => row.key === evidenceCategory); if (categories.length && !category) return jsonError("Evidence category is not configured for this request", 409, { allowed_categories: categories });
      const document = await createControlledDocument({ organizationId: context.run.organization_id, entityId: context.run.entity_id || null, actor: null, file, documentName: file.name, documentType: "ACCOUNTING_EVIDENCE", classification: "CONFIDENTIAL", referenceType: "accounting_client_request", referenceId: context.requestRow.id, tags: ["accounting","client-portal",evidenceCategory || "general"], metadata: { upload_source: "finance_client_portal", accounting_firm_id: context.grant.accounting_firm_id, engagement_id: context.engagement.id, run_id: context.run.id, work_item_id: context.item.id, evidence_category: evidenceCategory || "general", external_submitter: true } });
      const documentId = clean(document?.id || document?.document_id); if (!documentId) throw new Error("Controlled document was created without an id");
      const { error: linkError } = await supabaseAdmin.from("accounting_work_program_evidence_links").insert({ accounting_firm_id: context.grant.accounting_firm_id, organization_id: context.run.organization_id, entity_id: context.run.entity_id, period_id: context.run.period_id, engagement_id: context.engagement.id, run_id: context.run.id, work_item_id: context.item.id, document_id: documentId, evidence_category: evidenceCategory || "general", status: "ACTIVE", is_primary: false, linked_by: null, metadata: { source: "client_portal", client_request_id: context.requestRow.id, controlled_document: true } }); if (linkError) throw linkError;
      const now = new Date().toISOString(); await supabaseAdmin.from("accounting_client_requests").update({ status: "IN_PROGRESS", updated_at: now }).eq("id", context.requestRow.id).eq("accounting_firm_id", context.grant.accounting_firm_id);
      await audit(context, "ACCOUNTING_CLIENT_PORTAL_EVIDENCE_UPLOADED", { client_request_id: context.requestRow.id, document_id: documentId, evidence_category: evidenceCategory || "general" }); return NextResponse.json({ success: true }, { status: 201 });
    }
    if (action === "submit") {
      const evidence = await loadEvidence(context); const evidenceCoverage = coverage(categories, evidence); const missing = evidenceCoverage.filter((row) => !row.satisfied); if (missing.length) return jsonError("Required evidence is still missing", 409, { missing_categories: missing }); if (!evidence.length) return jsonError("At least one controlled evidence document is required", 409);
      const now = new Date().toISOString(); const responseText = clean(form.get("response") || form.get("client_response")); const clientResponse = { ...(context.requestRow.client_response || {}), message: responseText || null, evidence_document_ids: evidence.map((row) => row.document_id), submitted_via: "accounting_client_portal" };
      const { error: requestError } = await supabaseAdmin.from("accounting_client_requests").update({ status: "SUBMITTED", submitted_at: now, client_response: clientResponse, updated_at: now }).eq("id", context.requestRow.id).eq("accounting_firm_id", context.grant.accounting_firm_id); if (requestError) throw requestError;
      const { error: itemError } = await supabaseAdmin.from("accounting_engagement_work_items").update({ status: "IN_PROGRESS", blocked_reason: null, updated_at: now }).eq("id", context.item.id).eq("accounting_firm_id", context.grant.accounting_firm_id); if (itemError) throw itemError;
      await audit(context, "ACCOUNTING_CLIENT_PORTAL_REQUEST_SUBMITTED", { client_request_id: context.requestRow.id, evidence_document_count: evidence.length }); return NextResponse.json({ success: true });
    }
    return jsonError("Unsupported portal action", 400);
  } catch (error) { return jsonError(error?.message || "Unable to update accounting client portal", 500); }
}
