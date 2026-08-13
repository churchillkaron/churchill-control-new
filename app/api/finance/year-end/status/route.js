export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = required(
      searchParams.get("organizationId") || searchParams.get("organization_id"),
      "organization_id"
    );
    const access = await requireOrganizationAccess({ organizationId, request });

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error, fiscal_years: [] }, { status: access.status });
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.accounting.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const { data, error } = await supabaseAdmin
      .from("finance_fiscal_years")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("fiscal_year", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, fiscal_years: data || [] });
  } catch (error) {
    const message = error.message || "Year-end status load failed";
    return NextResponse.json(
      { success: false, error: message, fiscal_years: [] },
      { status: String(message).toLowerCase().includes("permission denied") ? 403 : /required/i.test(message) ? 400 : 500 }
    );
  }
}
