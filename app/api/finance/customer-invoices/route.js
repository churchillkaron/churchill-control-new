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

    const { data, error } = await supabaseAdmin
      .from("customer_invoices")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, invoices: data || [] });
  } catch (error) {
    const message = error.message || "Customer invoice list failed";
    return NextResponse.json(
      { success: false, error: message, invoices: [] },
      { status: statusFor(message) }
    );
  }
}
