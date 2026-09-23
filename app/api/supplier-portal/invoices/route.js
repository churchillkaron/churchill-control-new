import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { signedStorageReference } from "@/lib/shared/storage/privateDocumentUrl";
import {
  supplierInvoiceSubmissionContext,
  supplierInvoiceSubmissions,
} from "@/lib/supplier-portal/SupplierStorefrontRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SUPPLIER_INVOICE_BUCKET = "supplier-finance-evidence";
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function respond(result, status = null) {
  return NextResponse.json(result, {
    status: status || (result?.success === false ? (result.status || 500) : 200),
  });
}

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET() {
  try {
    return respond(await supplierInvoiceSubmissions());
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to load supplier invoice submissions" });
  }
}

export async function POST(request) {
  let storagePath = "";
  let documentId = null;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file.arrayBuffer !== "function" || Number(file.size || 0) <= 0) {
      return respond({ success: false, status: 400, error: "Invoice file is required" });
    }
    if (file.size > MAX_FILE_BYTES) {
      return respond({ success: false, status: 400, error: "Invoice file must be 20 MB or smaller" });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return respond({ success: false, status: 400, error: "Invoice file must be PDF, JPG, PNG or WEBP" });
    }

    const invoiceNumber = clean(formData.get("invoiceNumber"), 180);
    const invoiceDate = clean(formData.get("invoiceDate"), 20);
    const dueDate = clean(formData.get("dueDate"), 20);
    const currencyCode = clean(formData.get("currencyCode"), 8).toUpperCase() || "THB";
    const totalAmount = Number(formData.get("totalAmount"));
    const supplierNote = clean(formData.get("supplierNote"), 2000);
    const supplierPortalAccessId = clean(formData.get("supplierPortalAccessId"), 80);
    const purchaseOrderId = clean(formData.get("purchaseOrderId"), 80);

    if (!invoiceNumber) return respond({ success: false, status: 400, error: "Invoice number is required" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
      return respond({ success: false, status: 400, error: "Invoice date must use YYYY-MM-DD" });
    }
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return respond({ success: false, status: 400, error: "Due date must use YYYY-MM-DD" });
    }
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return respond({ success: false, status: 400, error: "Total amount must be greater than zero" });
    }

    const context = await supplierInvoiceSubmissionContext({
      supplierPortalAccessId,
      purchaseOrderId,
    });
    if (!context.success) return respond(context);

    const submissionId = randomUUID();
    const safeName = String(file.name || "supplier-invoice")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .slice(0, 180);
    storagePath = `${context.access.organization_id}/supplier-invoices/${submissionId}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(SUPPLIER_INVOICE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: document, error: documentError } = await supabaseAdmin
      .from("organization_documents")
      .insert({
        organization_id: context.access.organization_id,
        uploaded_by: context.identity.user.id,
        file_url: `storage://${SUPPLIER_INVOICE_BUCKET}/${storagePath}`,
        file_name: file.name || safeName,
        mime_type: file.type,
        ai_module: "finance",
        ai_type: "supplier_invoice_submission",
        approval_required: true,
        financial_impact: true,
        status: "uploaded",
        destination_module: "finance.accounts_payable",
        destination_record_id: submissionId,
      })
      .select("*")
      .single();
    if (documentError) throw documentError;
    documentId = document.id;

    const { data: submission, error: submissionError } = await supabaseAdmin
      .from("supplier_invoice_submissions")
      .insert({
        id: submissionId,
        supplier_account_id: context.account.id,
        supplier_portal_access_id: context.access.id,
        organization_id: context.access.organization_id,
        entity_id: context.purchaseOrder?.entity_id || null,
        supplier_party_id: context.access.supplier_party_id,
        purchase_order_id: context.purchaseOrder?.id || null,
        organization_document_id: document.id,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        currency_code: currencyCode,
        total_amount: totalAmount,
        supplier_note: supplierNote || null,
        status: "SUBMITTED",
        submitted_by_auth_user_id: context.identity.user.id,
      })
      .select("*")
      .single();

    if (submissionError) {
      await supabaseAdmin.from("organization_documents").delete().eq("id", document.id);
      await supabaseAdmin.storage.from(SUPPLIER_INVOICE_BUCKET).remove([storagePath]);
      throw submissionError;
    }

    return respond({
      success: true,
      submission,
      document: {
        id: document.id,
        file_name: document.file_name,
        file_url: await signedStorageReference(document.file_url),
        mime_type: document.mime_type,
      },
    });
  } catch (error) {
    if (documentId) {
      try {
        await supabaseAdmin.from("organization_documents").delete().eq("id", documentId);
      } catch {}
    }
    if (storagePath) {
      try {
        await supabaseAdmin.storage.from(SUPPLIER_INVOICE_BUCKET).remove([storagePath]);
      } catch {}
    }
    return respond({ success: false, error: error?.message || "Unable to submit supplier invoice" });
  }
}
