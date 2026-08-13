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
    const organizationId = access.organizationId;
    const [invoices, receivables, payments, overdue] = await Promise.all([
      supabaseAdmin.from("customer_invoices").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
      supabaseAdmin.from("accounts_receivable").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
      supabaseAdmin.from("customer_payments").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
      supabaseAdmin.from("accounts_receivable").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).gt("due_date", "1900-01-01").neq("status", "paid"),
    ]);
    const queryError = invoices.error || receivables.error || payments.error || overdue.error;
    if (queryError) throw queryError;
    return NextResponse.json({ success: true, invoices: invoices.count || 0, receivables: receivables.count || 0, payments: payments.count || 0, overdue: overdue.count || 0 });
  } catch (error) { const message = error.message || "Accounts receivable runtime failed"; return NextResponse.json({ success: false, error: message }, { status: statusFor(message) }); }
}
