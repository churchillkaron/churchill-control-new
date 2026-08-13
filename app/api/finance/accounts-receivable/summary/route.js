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
    const { data, error } = await supabaseAdmin.from("accounts_receivable").select("*").eq("organization_id", access.organizationId);
    if (error) throw error;
    const rows = data || [];
    let total = 0;
    let overdue = 0;
    const now = new Date();
    for (const row of rows) {
      const amount = Number(row.outstanding_balance || 0);
      const due = new Date(row.due_date || now);
      total += amount;
      if (due < now && amount > 0) overdue += amount;
    }
    return NextResponse.json({ success: true, totalReceivables: total, overdue, count: rows.length });
  } catch (error) { const message = error.message || "Accounts receivable summary failed"; return NextResponse.json({ success: false, error: message }, { status: statusFor(message) }); }
}
