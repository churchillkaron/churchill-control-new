export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  if (normalized.includes("required")) return 400;
  return 500;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, invoices: [] },
        { status: access.status }
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.receivables.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const entityId = searchParams.get("entityId") || searchParams.get("entity_id");
    let query = supabaseAdmin
      .from("customer_invoices")
      .select("*")
      .eq("organization_id", access.organizationId);
    if (entityId) query = query.eq("entity_id", entityId);
    const invoiceId = searchParams.get("id") || searchParams.get("invoice_id");
    if (invoiceId) query = query.eq("id", invoiceId);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;

    const invoices = (data || []).map((invoice) => {
      const base = `/api/finance/customer-invoices/${invoice.id}/pdf?organizationId=${encodeURIComponent(access.organizationId)}${entityId ? `&entityId=${encodeURIComponent(entityId)}` : ""}`;
      return {
        ...invoice,
        preview_url: base,
        pdf_url: base,
        ...(String(invoice.status || "").toUpperCase() === "PAID"
          ? { receipt_url: `${base}&mode=receipt` }
          : {}),
      };
    });

    return NextResponse.json({ success: true, invoices });
  } catch (error) {
    const message = error.message || "Customer invoice list failed";
    return NextResponse.json(
      { success: false, error: message, invoices: [] },
      { status: statusFor(message) }
    );
  }
}
