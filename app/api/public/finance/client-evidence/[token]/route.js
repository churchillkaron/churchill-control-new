export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { createControlledDocument } from "@/lib/documents/runtime/DocumentControlRuntime";
import {
  markClientEvidenceViewed,
  resolveClientEvidenceGrant,
} from "@/lib/finance/practice/FinanceClientEvidenceGrant";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["image/"];
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400, details = undefined) {
  return NextResponse.json({ success: false, error: message, ...(details ? { details } : {}) }, { status });
}

function verificationCategories(item) {
  const verification = item?.metadata?.system_verification;
  if (verification?.mode !== "DOCUMENT_CATEGORIES") return [];
  return (Array.isArray(verification.categories) ? verification.categories : [])
    .map((category) => ({
      key: clean(category?.key).toLowerCase(),
      label: clean(category?.label || category?.key),
      min_count: Math.max(1, Number(category?.min_count || 1)),
    }))
    .filter((category) => category.key);
}

function allowedFile(file) {
  const mime = clean(file?.type).toLowerCase();
  if (!mime) return true;
  return ALLOWED_MIME_TYPES.has(mime) || ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

async function loadContext(token, { markViewed = false } = {}) {
  const resolved = await resolveClientEvidenceGrant(token);
  if (!resolved) return { error: "This evidence request link is invalid or expired", status: 404 };
  let requestRow = resolved.request;

  const [{ data: run, error: runError }, { data: item, error: itemError }] = await Promise.all([
    supabaseAdmin
      .from("accounting_engagement_runs")
      .select("id,accounting_firm_id,organization_id,entity_id,period_id,engagement_id,status,locked_at")
      .eq("id", requestRow.run_id)
      .eq("accounting_firm_id", requestRow.accounting_firm_id)
      .maybeSingle(),
    supabaseAdmin
      .from("accounting_engagement_work_items")
      .select("id,accounting_firm_id,organization_id,entity_id,run_id,title,work_type,status,capability_id,metadata")
      .eq("id", requestRow.work_item_id)
      .eq("accounting_firm_id", requestRow.accounting_firm_id)
      .maybeSingle(),
  ]);
  if (runError) throw runError;
  if (itemError) throw itemError;
  if (!run || !item) return { error: "Accounting request scope no longer exists", status: 404 };
  if (run.locked_at) return { error: "This accounting work program is already closed", status: 409 };
  if (item.run_id !== run.id || requestRow.organization_id !== run.organization_id) {
    return { error: "Accounting request scope is invalid", status: 409 };
  }
  if (item.work_type !== "CLIENT_REQUEST" || item.capability_id !== "documents") {
    return { error: "This client request does not accept document evidence", status: 409 };
  }

  if (markViewed) requestRow = await markClientEvidenceViewed(requestRow);
  return { requestRow, run, item, grant: resolved.grant };
}

async function loadEvidence(context) {
  const { data: links, error } = await supabaseAdmin
    .from("accounting_work_program_evidence_links")
    .select("id,document_id,evidence_category,status,is_primary,linked_at,metadata")
    .eq("accounting_firm_id", context.requestRow.accounting_firm_id)
    .eq("run_id", context.run.id)
    .eq("work_item_id", context.item.id)
    .eq("status", "ACTIVE")
    .order("linked_at", { ascending: false });
  if (error) throw error;

  const documentIds = [...new Set((links || []).map((row) => row.document_id).filter(Boolean))];
  const { data: documents, error: documentsError } = documentIds.length
    ? await supabaseAdmin
        .from("enterprise_documents")
        .select("id,document_name,mime_type,file_size_bytes,classification,created_at")
        .eq("organization_id", context.run.organization_id)
        .in("id", documentIds)
    : { data: [], error: null };
  if (documentsError) throw documentsError;
  const documentMap = new Map((documents || []).map((row) => [row.id, row]));

  return (links || []).map((link) => ({
    id: link.id,
    document_id: link.document_id,
    evidence_category: link.evidence_category,
    linked_at: link.linked_at,
    document: documentMap.get(link.document_id) || null,
  }));
}

function coverage(categories, evidence) {
  return categories.map((category) => {
    const count = evidence.filter((row) => row.evidence_category === category.key).length;
    return {
      ...category,
      linked_count: count,
      missing_count: Math.max(0, category.min_count - count),
      satisfied: count >= category.min_count,
    };
  });
}

async function audit(context, action, metadata = {}) {
  const { error } = await supabaseAdmin.from("organization_audit_logs").insert({
    organization_id: context.requestRow.accounting_firm_id,
    entity_type: "accounting_client_request",
    entity_id: String(context.requestRow.id),
    action,
    metadata: {
      client_organization_id: context.run.organization_id,
      entity_id: context.run.entity_id,
      period_id: context.run.period_id,
      run_id: context.run.id,
      work_item_id: context.item.id,
      public_client_evidence: true,
      ...metadata,
    },
    actor_email: null,
  });
  if (error) throw error;
}

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const token = clean(resolvedParams?.token);
    const context = await loadContext(token, { markViewed: true });
    if (context.error) return jsonError(context.error, context.status);
    const categories = verificationCategories(context.item);
    const evidence = await loadEvidence(context);
    const evidenceCoverage = coverage(categories, evidence);

    const { data: organization } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("id", context.run.organization_id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      request: {
        title: context.requestRow.title,
        instructions: context.requestRow.instructions,
        status: context.requestRow.status === "SENT" ? "VIEWED" : context.requestRow.status,
        due_at: context.requestRow.due_at,
        client_name: organization?.name || "Client",
        expires_at: context.grant.expires_at,
      },
      categories: evidenceCoverage,
      evidence,
      ready_to_submit: evidenceCoverage.length === 0 || evidenceCoverage.every((row) => row.satisfied),
    });
  } catch (error) {
    return jsonError(error?.message || "Unable to load client evidence request", 500);
  }
}

export async function POST(request, { params }) {
  try {
    const resolvedParams = await params;
    const token = clean(resolvedParams?.token);
    const context = await loadContext(token, { markViewed: true });
    if (context.error) return jsonError(context.error, context.status);

    const form = await request.formData();
    const action = clean(form.get("action") || "upload").toLowerCase();
    const categories = verificationCategories(context.item);

    if (action === "upload") {
      const file = form.get("file");
      const evidenceCategory = clean(form.get("evidenceCategory") || form.get("evidence_category")).toLowerCase();
      if (!file || typeof file.arrayBuffer !== "function") return jsonError("File required");
      if (Number(file.size || 0) <= 0 || Number(file.size || 0) > MAX_FILE_BYTES) return jsonError("File must be between 1 byte and 25 MB", 413);
      if (!allowedFile(file)) return jsonError("Unsupported evidence file type", 415);
      const category = categories.find((row) => row.key === evidenceCategory);
      if (!category) return jsonError("Evidence category is not configured for this request", 409, { allowed_categories: categories });

      const document = await createControlledDocument({
        organizationId: context.run.organization_id,
        entityId: context.run.entity_id || null,
        actor: null,
        file,
        documentName: file.name,
        documentType: "ACCOUNTING_EVIDENCE",
        classification: "CONFIDENTIAL",
        referenceType: "accounting_client_request",
        referenceId: context.requestRow.id,
        tags: ["accounting", "client-evidence", evidenceCategory],
        metadata: {
          upload_source: "finance_client_evidence_request",
          accounting_firm_id: context.requestRow.accounting_firm_id,
          run_id: context.run.id,
          work_item_id: context.item.id,
          evidence_category: evidenceCategory,
          external_submitter: true,
        },
      });
      const documentId = clean(document?.id || document?.document_id);
      if (!documentId) throw new Error("Controlled document was created without an id");

      const { data: link, error: linkError } = await supabaseAdmin
        .from("accounting_work_program_evidence_links")
        .insert({
          accounting_firm_id: context.requestRow.accounting_firm_id,
          organization_id: context.run.organization_id,
          entity_id: context.run.entity_id,
          period_id: context.run.period_id,
          engagement_id: context.run.engagement_id,
          run_id: context.run.id,
          work_item_id: context.item.id,
          document_id: documentId,
          evidence_category: evidenceCategory,
          status: "ACTIVE",
          is_primary: false,
          linked_by: null,
          metadata: {
            category_label: category.label,
            source: "client_evidence_request",
            controlled_document: true,
            client_request_id: context.requestRow.id,
          },
        })
        .select("id,document_id,evidence_category,status,linked_at")
        .single();
      if (linkError) throw linkError;

      const now = new Date().toISOString();
      const { error: requestUpdateError } = await supabaseAdmin
        .from("accounting_client_requests")
        .update({ status: "IN_PROGRESS", updated_at: now })
        .eq("id", context.requestRow.id)
        .eq("accounting_firm_id", context.requestRow.accounting_firm_id);
      if (requestUpdateError) throw requestUpdateError;

      await audit(context, "ACCOUNTING_CLIENT_EVIDENCE_UPLOADED", {
        document_id: documentId,
        evidence_link_id: link.id,
        evidence_category: evidenceCategory,
        file_size_bytes: Number(file.size || 0),
      });

      const evidence = await loadEvidence(context);
      const evidenceCoverage = coverage(categories, evidence);
      return NextResponse.json({
        success: true,
        evidence_link: link,
        categories: evidenceCoverage,
        ready_to_submit: evidenceCoverage.length === 0 || evidenceCoverage.every((row) => row.satisfied),
      }, { status: 201 });
    }

    if (action === "submit") {
      const evidence = await loadEvidence(context);
      const evidenceCoverage = coverage(categories, evidence);
      const missing = evidenceCoverage.filter((row) => !row.satisfied);
      if (missing.length) return jsonError("Required evidence is still missing", 409, { missing_categories: missing });
      if (!evidence.length) return jsonError("At least one controlled evidence document is required", 409);

      const now = new Date().toISOString();
      const responseText = clean(form.get("response") || form.get("client_response"));
      const clientResponse = {
        ...(context.requestRow.client_response || {}),
        message: responseText || null,
        evidence_document_ids: evidence.map((row) => row.document_id),
        submitted_via: "secure_client_evidence_link",
      };
      const { data: updatedRequest, error: requestError } = await supabaseAdmin
        .from("accounting_client_requests")
        .update({ status: "SUBMITTED", submitted_at: now, client_response: clientResponse, updated_at: now })
        .eq("id", context.requestRow.id)
        .eq("accounting_firm_id", context.requestRow.accounting_firm_id)
        .select("id,status,submitted_at,due_at,title")
        .single();
      if (requestError) throw requestError;

      const { error: itemError } = await supabaseAdmin
        .from("accounting_engagement_work_items")
        .update({ status: "IN_PROGRESS", blocked_reason: null, updated_at: now })
        .eq("id", context.item.id)
        .eq("accounting_firm_id", context.requestRow.accounting_firm_id);
      if (itemError) throw itemError;

      await audit(context, "ACCOUNTING_CLIENT_EVIDENCE_SUBMITTED", {
        evidence_document_count: evidence.length,
        evidence_categories: [...new Set(evidence.map((row) => row.evidence_category))],
      });
      return NextResponse.json({ success: true, request: updatedRequest });
    }

    return jsonError("Unsupported client evidence action", 400);
  } catch (error) {
    return jsonError(error?.message || "Unable to update client evidence request", error?.status || 500);
  }
}
