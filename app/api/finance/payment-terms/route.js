export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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
      permissionKey: "finance.accounting.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const { data, error } = await supabaseAdmin
      .from("payment_terms")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      paymentTerms: data || [],
      rows: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Payment terms load failed" },
      { status: statusFor(error) }
    );
  }
}
