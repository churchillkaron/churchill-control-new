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
    const sourceType = searchParams.get("source_type");
    const sourceId = searchParams.get("source_id");
    const requestedOrganizationId =
      searchParams.get("organizationId") || searchParams.get("organization_id");

    if (!sourceType || !sourceId) {
      return NextResponse.json(
        { success: false, error: "source_type and source_id required" },
        { status: 400 }
      );
    }

    if (!requestedOrganizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId required" },
        { status: 400 }
      );
    }

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

    const { data, error } = await supabaseAdmin
      .from("journal_entries")
      .select(`
        *,
        journal_entry_lines (
          *,
          chart_of_accounts (
            id,
            account_code,
            account_name,
            account_category,
            account_type
          )
        )
      `)
      .eq("organization_id", access.organizationId)
      .eq("source_type", sourceType)
      .eq("source_id", sourceId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const chain = (data || []).map((journal) => ({
      id: journal.id,
      description: journal.description,
      status: journal.status,
      created_at: journal.created_at,
      lines: (journal.journal_entry_lines || []).map((line) => ({
        id: line.id,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        account: {
          code: line.chart_of_accounts?.account_code,
          name: line.chart_of_accounts?.account_name,
          category: line.chart_of_accounts?.account_category,
        },
      })),
    }));

    return NextResponse.json({
      success: true,
      source_type: sourceType,
      source_id: sourceId,
      count: chain.length,
      chain,
    });
  } catch (error) {
    const message = error.message || "Journal chain load failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
