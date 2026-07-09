export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const access = await requireOrganizationAccess({
      organizationId: searchParams.get("organizationId"),
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const organizationId = access.organizationId;

    const { data, error } = await supabaseAdmin
      .from("accounts_receivable")
      .select("*")
      .eq("organization_id", organizationId);

    if (error) throw error;

    const rows = data || [];

    let total = 0;
    let overdue = 0;

    const now = new Date();

    for (const r of rows) {
      const amount = Number(r.outstanding_balance || 0);
      const due = new Date(r.due_date || now);

      total += amount;

      if (due < now && amount > 0) {
        overdue += amount;
      }
    }

    return NextResponse.json({
      success: true,
      totalReceivables: total,
      overdue,
      count: rows.length,
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
