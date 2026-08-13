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
        { success: false, error: access.error, vendors: [] },
        { status: access.status }
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.payables.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const { data, error } = await supabaseAdmin
      .from("supplier_profiles")
      .select(`
        *,
        parties (
          id,
          legal_name,
          display_name,
          tax_id,
          email,
          phone,
          address,
          status
        )
      `)
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({
        success: true,
        vendors: [],
        warning: error.message,
      });
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      vendors: (data || []).map((row) => ({
        id: row.party_id,
        vendor_code: row.vendor_code,
        legal_name: row.parties?.legal_name,
        vendor_name: row.parties?.display_name || row.parties?.legal_name,
        name: row.parties?.display_name || row.parties?.legal_name,
        display_name: row.parties?.display_name,
        tax_id: row.parties?.tax_id,
        email: row.parties?.email,
        vendor_email: row.parties?.email,
        phone: row.parties?.phone,
        vendor_phone: row.parties?.phone,
        address: row.parties?.address,
        payment_terms: row.payment_terms,
        risk_level: row.risk_level,
        is_active: row.is_active,
        is_blocked: row.is_blocked,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Vendor load failed", vendors: [] },
      { status: statusFor(error) }
    );
  }
}
