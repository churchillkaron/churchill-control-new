import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { signedStorageReference } from "@/lib/shared/storage/privateDocumentUrl";

export const dynamic = "force-dynamic";

function jsonError(error, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

async function requireFinanceView(access) {
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.view",
    fullAccess: access.permissions?.includes("*") === true,
  });
}

async function requirePayablesManage(access) {
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.payables.manage",
    fullAccess: access.permissions?.includes("*") === true,
  });
}

async function loadSubmissions({ organizationId, submissionId = null, page = 1, pageSize = 50 }) {
  let query = supabaseAdmin
    .from("supplier_invoice_submissions")
    .select("id,supplier_account_id,supplier_party_id,supplier_portal_access_id,organization_id,entity_id,purchase_order_id,organization_document_id,invoice_number,invoice_date,due_date,currency_code,total_amount,supplier_note,status,canonical_vendor_invoice_id,submitted_by_auth_user_id,reviewed_by_auth_user_id,reviewed_at,review_note,created_at,updated_at", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (submissionId) {
    query = query.eq("id", submissionId);
  } else {
    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);
  }

  const { data: submissions, error, count } = await query;
  if (error) throw error;

  const accountIds = [...new Set((submissions || []).map((row) => row.supplier_account_id).filter(Boolean))];
  const documentIds = [...new Set((submissions || []).map((row) => row.organization_document_id).filter(Boolean))];
  const poIds = [...new Set((submissions || []).map((row) => row.purchase_order_id).filter(Boolean))];

  const [accountsResult, documentsResult, ordersResult] = await Promise.all([
    accountIds.length
      ? supabaseAdmin.from("supplier_portal_accounts").select("id,business_name,display_name,email").in("id", accountIds)
      : Promise.resolve({ data: [], error: null }),
    documentIds.length
      ? supabaseAdmin.from("organization_documents").select("id,file_name,file_url,mime_type,status,approval_required,financial_impact").eq("organization_id", organizationId).in("id", documentIds)
      : Promise.resolve({ data: [], error: null }),
    poIds.length
      ? supabaseAdmin.from("purchase_orders").select("id,po_number,status,total_amount,currency").eq("organization_id", organizationId).in("id", poIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (accountsResult.error) throw accountsResult.error;
  if (documentsResult.error) throw documentsResult.error;
  if (ordersResult.error) throw ordersResult.error;

  const accountById = new Map((accountsResult.data || []).map((row) => [String(row.id), row]));
  const documentById = new Map((documentsResult.data || []).map((row) => [String(row.id), row]));
  const poById = new Map((ordersResult.data || []).map((row) => [String(row.id), row]));

  const rows = await Promise.all((submissions || []).map(async (row) => {
    const document = row.organization_document_id ? documentById.get(String(row.organization_document_id)) || null : null;
    return {
      ...row,
      supplier: accountById.get(String(row.supplier_account_id)) || null,
      document: document
        ? { ...document, file_url: await signedStorageReference(document.file_url) }
        : null,
      purchase_order: row.purchase_order_id ? poById.get(String(row.purchase_order_id)) || null : null,
    };
  }));

  return { rows, count: Number(count || 0) };
}

export async function GET(request) {
  try {
    const organizationId = request.nextUrl.searchParams.get("organizationId") || request.nextUrl.searchParams.get("organization_id");
    const submissionId = String(request.nextUrl.searchParams.get("submissionId") || request.nextUrl.searchParams.get("submission_id") || "").trim();
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") || request.nextUrl.searchParams.get("page_size")) || 50));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status);

    if (submissionId) await requirePayablesManage(access);
    else await requireFinanceView(access);

    const result = await loadSubmissions({
      organizationId: access.organizationId,
      submissionId: submissionId || null,
      page,
      pageSize,
    });

    return NextResponse.json({
      success: true,
      submissions: result.rows,
      submission: submissionId ? result.rows[0] || null : null,
      pagination: submissionId ? null : {
        page,
        page_size: pageSize,
        total: result.count,
        has_more: page * pageSize < result.count,
      },
    });
  } catch (error) {
    return jsonError(error?.message || "Unable to load supplier invoice submissions", 500);
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const organizationId = body?.organizationId || body?.organization_id;
    const submissionId = String(body?.submissionId || body?.submission_id || "").trim();
    const action = String(body?.action || "").trim().toUpperCase();
    const reviewNote = String(body?.reviewNote || body?.review_note || "").trim().slice(0, 2000) || null;

    if (!submissionId) return jsonError("submissionId required");
    if (!["START_REVIEW","ACCEPT","REJECT","CONVERT"].includes(action)) return jsonError("Unsupported supplier invoice review action");
    if (action === "REJECT" && !reviewNote) return jsonError("Review note is required when rejecting a supplier invoice");
    const canonicalVendorInvoiceId = String(body?.canonicalVendorInvoiceId || body?.canonical_vendor_invoice_id || "").trim();
    if (action === "CONVERT" && !canonicalVendorInvoiceId) return jsonError("canonicalVendorInvoiceId required for conversion");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status);
    await requirePayablesManage(access);

    const { data: current, error: currentError } = await supabaseAdmin
      .from("supplier_invoice_submissions")
      .select("*")
      .eq("id", submissionId)
      .eq("organization_id", access.organizationId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return jsonError("Supplier invoice submission not found", 404);

    const currentStatus = String(current.status || "").toUpperCase();
    const allowed = {
      SUBMITTED: new Set(["START_REVIEW","ACCEPT","REJECT"]),
      UNDER_REVIEW: new Set(["ACCEPT","REJECT"]),
      ACCEPTED: new Set(["CONVERT"]),
      REJECTED: new Set([]),
      CONVERTED: new Set([]),
    };
    if (!allowed[currentStatus]?.has(action)) {
      return jsonError(`Invalid supplier invoice review transition ${currentStatus} → ${action}`, 409);
    }

    if (action === "CONVERT") {
      const { data: canonicalInvoice, error: canonicalInvoiceError } = await supabaseAdmin
        .from("vendor_invoices")
        .select("id,organization_id,vendor_party_id,invoice_number,total_amount,currency_code")
        .eq("id", canonicalVendorInvoiceId)
        .eq("organization_id", access.organizationId)
        .maybeSingle();
      if (canonicalInvoiceError) throw canonicalInvoiceError;
      if (!canonicalInvoice) return jsonError("Canonical Vendor Bill was not found in this organization", 404);
      if (String(canonicalInvoice.vendor_party_id || "") !== String(current.supplier_party_id || "")) {
        return jsonError("Canonical Vendor Bill supplier does not match the supplier submission", 409);
      }
      if (String(canonicalInvoice.invoice_number || "") !== String(current.invoice_number || "")) {
        return jsonError("Canonical Vendor Bill invoice number does not match the supplier submission", 409);
      }
      if (Math.abs(Number(canonicalInvoice.total_amount || 0) - Number(current.total_amount || 0)) > 0.01) {
        return jsonError("Canonical Vendor Bill total does not match the supplier submission", 409);
      }
      if (String(canonicalInvoice.currency_code || "").toUpperCase() !== String(current.currency_code || "").toUpperCase()) {
        return jsonError("Canonical Vendor Bill currency does not match the supplier submission", 409);
      }
    }

    const nextStatus = action === "START_REVIEW"
      ? "UNDER_REVIEW"
      : action === "ACCEPT"
        ? "ACCEPTED"
        : action === "CONVERT"
          ? "CONVERTED"
          : "REJECTED";
    const now = new Date().toISOString();
    const updatePayload = {
      status: nextStatus,
      updated_at: now,
    };
    if (action === "CONVERT") {
      updatePayload.canonical_vendor_invoice_id = canonicalVendorInvoiceId;
    } else {
      updatePayload.reviewed_by_auth_user_id = access.user?.id || null;
      updatePayload.reviewed_at = now;
      updatePayload.review_note = reviewNote;
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("supplier_invoice_submissions")
      .update(updatePayload)
      .eq("id", current.id)
      .eq("organization_id", access.organizationId)
      .select("*")
      .single();
    if (updateError) throw updateError;

    if (current.organization_document_id) {
      const documentPatch = action === "REJECT"
        ? { status: "rejected", approval_required: true, approved_by: null, approved_at: null, updated_at: now }
        : ["ACCEPT","CONVERT"].includes(action)
          ? { status: "approved", approval_required: false, approved_by: access.user?.id || current.reviewed_by_auth_user_id || null, approved_at: current.reviewed_at || now, updated_at: now }
          : { status: "under_review", approval_required: true, updated_at: now };
      const { error: documentError } = await supabaseAdmin
        .from("organization_documents")
        .update(documentPatch)
        .eq("id", current.organization_document_id)
        .eq("organization_id", access.organizationId);
      if (documentError) throw documentError;
    }

    try {
      await supabaseAdmin.from("organization_audit_logs").insert({
        organization_id: access.organizationId,
        entity_type: "supplier_invoice_submission",
        entity_id: current.id,
        action: `SUPPLIER_INVOICE_${action}`,
        before_data: current,
        after_data: updated,
        metadata: { review_note: reviewNote, accounting_posted: action === "CONVERT", canonical_vendor_invoice_id: canonicalVendorInvoiceId || null },
        actor_email: access.user?.email || null,
      });
    } catch {}

    return NextResponse.json({
      success: true,
      submission: updated,
      accounting_posted: action === "CONVERT",
      next_step: nextStatus === "ACCEPTED" ? "Prepare canonical vendor invoice through Finance AP" : null,
    });
  } catch (error) {
    return jsonError(error?.message || "Unable to review supplier invoice submission", 500);
  }
}
