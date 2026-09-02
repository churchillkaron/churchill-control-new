export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_PERMISSIONS = [
  "finance.accounting.manage",
  "finance.close.execute",
  "finance.configuration.manage",
];

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400, details = undefined) {
  return NextResponse.json({ success: false, error: message, ...(details ? { details } : {}) }, { status });
}

async function requireFinanceView(access) {
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.view",
    fullAccess: access.permissions?.includes("*") === true,
  });
}

async function requireManage(access) {
  if (access.permissions?.includes("*") === true) return;
  let lastError = null;
  for (const permissionKey of MANAGE_PERMISSIONS) {
    try {
      await checkFinancePermission({
        organizationId: access.organizationId,
        userId: access.user?.id,
        permissionKey,
        fullAccess: false,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Finance work program permission denied");
}

async function loadScopedWorkItem(access, workItemId) {
  const { data: item, error: itemError } = await supabaseAdmin
    .from("accounting_engagement_work_items")
    .select("*")
    .eq("id", workItemId)
    .eq("accounting_firm_id", access.organizationId)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!item) return { error: "Accounting work item not found", status: 404 };

  const { data: run, error: runError } = await supabaseAdmin
    .from("accounting_engagement_runs")
    .select("*")
    .eq("id", item.run_id)
    .eq("accounting_firm_id", access.organizationId)
    .maybeSingle();
  if (runError) throw runError;
  if (!run) return { error: "Accounting engagement run not found", status: 404 };
  if (!run.organization_id || !run.entity_id || !run.period_id) {
    return { error: "Accounting run must have organization, entity and period scope before evidence can be linked", status: 409 };
  }

  return { item, run };
}

function configuredCategories(item) {
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

async function loadDocument(run, documentId) {
  const { data, error } = await supabaseAdmin
    .from("organization_documents")
    .select("id,organization_id,file_name,file_url,mime_type,status,approval_required,approved_at,created_at,updated_at")
    .eq("id", documentId)
    .eq("organization_id", run.organization_id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function audit(access, action, entityId, metadata) {
  const { error } = await supabaseAdmin.from("organization_audit_logs").insert({
    organization_id: access.organizationId,
    entity_type: "accounting_work_program_evidence_link",
    entity_id: String(entityId),
    action,
    metadata,
    actor_email: access.user?.email || null,
  });
  if (error) throw error;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = clean(searchParams.get("organizationId") || searchParams.get("organization_id"));
    const workItemId = clean(searchParams.get("workItemId") || searchParams.get("work_item_id"));
    if (!workItemId) return jsonError("workItemId is required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireFinanceView(access);

    const scoped = await loadScopedWorkItem(access, workItemId);
    if (scoped.error) return jsonError(scoped.error, scoped.status);
    const { item, run } = scoped;

    const { data: links, error } = await supabaseAdmin
      .from("accounting_work_program_evidence_links")
      .select("id,document_id,evidence_category,status,is_primary,linked_by,linked_at,metadata,created_at,updated_at")
      .eq("accounting_firm_id", access.organizationId)
      .eq("run_id", run.id)
      .eq("work_item_id", item.id)
      .order("linked_at", { ascending: false });
    if (error) throw error;

    const documentIds = [...new Set((links || []).map((link) => link.document_id).filter(Boolean))];
    const { data: documents, error: documentsError } = documentIds.length
      ? await supabaseAdmin
          .from("organization_documents")
          .select("id,file_name,file_url,mime_type,status,approval_required,approved_at,created_at,updated_at")
          .eq("organization_id", run.organization_id)
          .in("id", documentIds)
      : { data: [], error: null };
    if (documentsError) throw documentsError;
    const documentsById = new Map((documents || []).map((document) => [document.id, document]));

    return NextResponse.json({
      success: true,
      work_item_id: item.id,
      run_id: run.id,
      categories: configuredCategories(item),
      links: (links || []).map((link) => ({ ...link, document: documentsById.get(link.document_id) || null })),
      no_external_message: true,
    });
  } catch (error) {
    const message = error?.message || "Unable to load accounting evidence links";
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organizationId || body.organization_id);
    const workItemId = clean(body.workItemId || body.work_item_id);
    const documentId = clean(body.documentId || body.document_id);
    const evidenceCategory = clean(body.evidenceCategory || body.evidence_category).toLowerCase();
    if (!workItemId || !documentId || !evidenceCategory) return jsonError("workItemId, documentId and evidenceCategory are required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);

    const scoped = await loadScopedWorkItem(access, workItemId);
    if (scoped.error) return jsonError(scoped.error, scoped.status);
    const { item, run } = scoped;
    if (run.locked_at) return jsonError("Completed work program is locked", 409);
    if (item.capability_id !== "documents") return jsonError("This work item does not accept classified document evidence", 409);

    const categories = configuredCategories(item);
    const category = categories.find((entry) => entry.key === evidenceCategory);
    if (!category) return jsonError("Evidence category is not configured for this work item", 409, { allowed_categories: categories });

    const document = await loadDocument(run, documentId);
    if (!document) return jsonError("Document not found for this client organization", 404);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("accounting_work_program_evidence_links")
      .select("*")
      .eq("accounting_firm_id", access.organizationId)
      .eq("work_item_id", item.id)
      .eq("document_id", document.id)
      .eq("evidence_category", evidenceCategory)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return NextResponse.json({ success: true, idempotent: true, evidence_link: existing, document, no_external_message: true });
    }

    const { data: link, error: insertError } = await supabaseAdmin
      .from("accounting_work_program_evidence_links")
      .insert({
        accounting_firm_id: access.organizationId,
        organization_id: run.organization_id,
        entity_id: run.entity_id,
        period_id: run.period_id,
        engagement_id: run.engagement_id,
        run_id: run.id,
        work_item_id: item.id,
        document_id: document.id,
        evidence_category: evidenceCategory,
        status: "ACTIVE",
        is_primary: body.isPrimary === true || body.is_primary === true,
        linked_by: access.user?.id || null,
        metadata: { category_label: category.label, source: "digital_engagement_file" },
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    await audit(access, "ACCOUNTING_EVIDENCE_LINKED", link.id, {
      run_id: run.id,
      work_item_id: item.id,
      client_organization_id: run.organization_id,
      entity_id: run.entity_id,
      period_id: run.period_id,
      document_id: document.id,
      evidence_category: evidenceCategory,
      no_external_message: true,
    });

    return NextResponse.json({ success: true, idempotent: false, evidence_link: link, document, no_external_message: true });
  } catch (error) {
    const message = error?.message || "Unable to link accounting evidence";
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organizationId || body.organization_id);
    const evidenceLinkId = clean(body.evidenceLinkId || body.evidence_link_id);
    if (!evidenceLinkId) return jsonError("evidenceLinkId is required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);

    const { data: link, error: linkError } = await supabaseAdmin
      .from("accounting_work_program_evidence_links")
      .select("*")
      .eq("id", evidenceLinkId)
      .eq("accounting_firm_id", access.organizationId)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link) return jsonError("Accounting evidence link not found", 404);

    const scoped = await loadScopedWorkItem(access, link.work_item_id);
    if (scoped.error) return jsonError(scoped.error, scoped.status);
    if (scoped.run.locked_at) return jsonError("Completed work program is locked", 409);
    if (link.status !== "ACTIVE") return NextResponse.json({ success: true, idempotent: true, evidence_link: link, no_external_message: true });

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("accounting_work_program_evidence_links")
      .update({ status: "SUPERSEDED", updated_at: new Date().toISOString() })
      .eq("id", link.id)
      .eq("status", "ACTIVE")
      .select("*")
      .single();
    if (updateError) throw updateError;

    await audit(access, "ACCOUNTING_EVIDENCE_UNLINKED", link.id, {
      run_id: link.run_id,
      work_item_id: link.work_item_id,
      document_id: link.document_id,
      evidence_category: link.evidence_category,
      no_external_message: true,
    });

    return NextResponse.json({ success: true, idempotent: false, evidence_link: updated, no_external_message: true });
  } catch (error) {
    const message = error?.message || "Unable to unlink accounting evidence";
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}
