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

    const organizationId = access.organizationId;
    const [journals, lines, accounts] = await Promise.all([
      supabaseAdmin
        .from("journal_entries")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId),
      supabaseAdmin
        .from("journal_entry_lines")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId),
      supabaseAdmin
        .from("chart_of_accounts")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId),
    ]);

    const queryError = journals.error || lines.error || accounts.error;
    if (queryError) throw queryError;

    return NextResponse.json({
      success: true,
      journals: journals.count || 0,
      journalLines: lines.count || 0,
      accounts: accounts.count || 0,
      reviewQueue: journals.count || 0,
      trialBalanceIssues: 0,
      reconciliationExceptions: 0,
    });
  } catch (error) {
    const message = error.message || "Accounting runtime load failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
