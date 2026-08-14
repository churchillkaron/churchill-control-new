export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

function statusFor(message) {
  return String(message || "").toLowerCase().includes("permission denied") ? 403 : 500;
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
      .from("audit_logs")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      logs: data || [],
    });
  } catch (error) {
    const message = error.message || "Audit trail live load failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
