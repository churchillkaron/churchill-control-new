export const dynamic = "force-dynamic";

import { renderCustomerInvoicePdf } from "@/lib/finance/accounts-receivable/documents/renderCustomerInvoicePdf";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CUSTOMER_PORTAL_COOKIE, resolveCustomerPortalSession } from "@/lib/customer-portal/CustomerPortalRuntime";

export async function GET(request, { params }) {
  try {
    const session = await resolveCustomerPortalSession(request.cookies.get(CUSTOMER_PORTAL_COOKIE)?.value || null);
    if (!session) return Response.json({ success: false, error: "Customer portal session required" }, { status: 401 });

    const routeParams = await params;
    const invoiceId = String(routeParams?.invoiceId || "").trim();
    if (!invoiceId) return Response.json({ success: false, error: "invoiceId required" }, { status: 400 });

    const invoice = await supabaseAdmin.from("customer_invoices")
      .select("id,entity_id,party_id,status")
      .eq("organization_id", session.organization_id)
      .eq("party_id", session.party_id)
      .eq("id", invoiceId)
      .maybeSingle();
    if (invoice.error) throw invoice.error;
    if (!invoice.data) return Response.json({ success: false, error: "Invoice not found" }, { status: 404 });

    const requestedMode = new URL(request.url).searchParams.get("mode");
    const mode = requestedMode === "receipt" ? "receipt" : "invoice";
    const rendered = await renderCustomerInvoicePdf({
      organizationId: session.organization_id,
      entityId: invoice.data.entity_id,
      invoiceId: invoice.data.id,
      mode,
    });

    return new Response(rendered.buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${rendered.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error?.message || "Invoice document unavailable";
    const status = /not found/i.test(message) ? 404 : /receipt requires/i.test(message) ? 409 : 400;
    return Response.json({ success: false, error: message }, { status });
  }
}
