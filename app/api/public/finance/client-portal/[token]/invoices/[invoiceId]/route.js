export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { renderCustomerInvoicePdf } from "@/lib/finance/accounts-receivable/documents/renderCustomerInvoicePdf";
import { resolveFinanceClientPortalGrant } from "@/lib/finance/practice/FinanceClientPortalGrant";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) { return String(value ?? "").trim(); }
function jsonError(error, status = 400) { return NextResponse.json({ success: false, error }, { status }); }

export async function GET(request, { params }) {
  try {
    const resolved = await params;
    const token = clean(resolved?.token);
    const invoiceId = clean(resolved?.invoiceId);
    const mode = clean(new URL(request.url).searchParams.get("mode") || "invoice").toLowerCase() === "receipt" ? "receipt" : "invoice";
    if (!invoiceId) return jsonError("invoiceId is required");
    const grant = await resolveFinanceClientPortalGrant(token, { markViewed: true });
    if (!grant) return jsonError("This accounting client portal link is invalid or expired", 404);
    const { data: batch, error: batchError } = await supabaseAdmin.from("accounting_practice_billing_batches")
      .select("invoice_id")
      .eq("accounting_firm_id", grant.accounting_firm_id)
      .eq("organization_id", grant.organization_id)
      .eq("engagement_id", grant.engagement_id)
      .eq("invoice_id", invoiceId)
      .eq("status", "INVOICED")
      .maybeSingle();
    if (batchError) throw batchError;
    if (!batch) return jsonError("Invoice is outside this client portal engagement", 404);
    const { data: invoice, error: invoiceError } = await supabaseAdmin.from("customer_invoices")
      .select("id,entity_id")
      .eq("organization_id", grant.accounting_firm_id)
      .eq("id", invoiceId)
      .maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice) return jsonError("Invoice not found", 404);
    const rendered = await renderCustomerInvoicePdf({ organizationId: grant.accounting_firm_id, entityId: invoice.entity_id || null, invoiceId, mode });
    return new Response(rendered.buffer, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${rendered.filename}"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error?.message || "Unable to open client portal invoice";
    return jsonError(message, Number(error?.status) || (/not found/i.test(message) ? 404 : 500));
  }
}
