export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

function statusFor(message) {
  return String(message || "").toLowerCase().includes("permission denied") ? 403 : 500;
}

export async function GET(request, { params }) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId =
      searchParams.get("organizationId") || searchParams.get("organization_id");

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
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

    const journalId = params.id;
    const { data: journal, error: journalError } = await supabaseAdmin
      .from("journal_entries")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("id", journalId)
      .maybeSingle();

    if (journalError) throw journalError;

    if (!journal) {
      return NextResponse.json(
        { success: false, error: "Journal not found" },
        { status: 404 }
      );
    }

    const { data: lines, error: linesError } = await supabaseAdmin
      .from("journal_entry_lines")
      .select(`
        *,
        chart_of_accounts (
          id,
          account_code,
          account_name,
          account_category,
          account_type
        )
      `)
      .eq("organization_id", access.organizationId)
      .eq("journal_entry_id", journalId)
      .order("created_at", { ascending: true });

    if (linesError) throw linesError;

    return NextResponse.json({
      success: true,
      journal,
      lines: lines || [],
    });
  } catch (error) {
    const message = error.message || "Journal load failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
