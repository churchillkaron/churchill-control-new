export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function statusFor(message) { const normalized = String(message || "").toLowerCase(); if (normalized.includes("permission denied")) return 403; return normalized.includes("required") ? 400 : 500; }

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({ organizationId: searchParams.get("organizationId") || searchParams.get("organization_id"), request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey: "finance.receivables.view", fullAccess: access.permissions?.includes("*") === true });
    const { data, error } = await supabaseAdmin.from("customer_invoices").select("*").eq("organization_id", access.organizationId).order("invoice_date", { ascending: false }).order("created_at", { ascending: false }).order("invoice_number", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ success: true, invoices: data || [] });
  } catch (error) { const message = error.message || "Customer invoice list failed"; return NextResponse.json({ success: false, error: message }, { status: statusFor(message) }); }
}
