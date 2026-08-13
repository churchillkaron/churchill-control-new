export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

function statusFor(error) {
  const message = String(error?.message || "");
  if (message.toLowerCase().includes("permission denied")) return 403;
  return error?.status || 500;
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
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.payables.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const organizationId = access.organizationId;
    const [vendors, purchaseOrders, receipts, invoices, matches, payables, payments] =
      await Promise.all([
        supabaseAdmin.from("supplier_profiles").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
        supabaseAdmin.from("purchase_orders").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
        supabaseAdmin.from("goods_receipts").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
        supabaseAdmin.from("vendor_invoices").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
        supabaseAdmin.from("invoice_matches").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
        supabaseAdmin.from("accounts_payable").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
        supabaseAdmin.from("vendor_payments").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
      ]);

    for (const result of [vendors, purchaseOrders, receipts, invoices, matches, payables, payments]) {
      if (result.error) throw result.error;
    }

    return NextResponse.json({
      success: true,
      organizationId,
      vendors: vendors.count || 0,
      purchaseOrders: purchaseOrders.count || 0,
      receipts: receipts.count || 0,
      invoices: invoices.count || 0,
      matches: matches.count || 0,
      payables: payables.count || 0,
      payments: payments.count || 0,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Procure-to-pay load failed" },
      { status: statusFor(error) }
    );
  }
}
