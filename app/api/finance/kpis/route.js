export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(request) {

  const { searchParams } = new URL(request.url);

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

  const { data: ledger } = await supabaseAdmin
    .from("general_ledger")
    .select(`
      *,
      chart_of_accounts!fk_general_ledger_account (
        id, code, name, category
      )
    `)
    .eq("organization_id", organizationId)
    .limit(10000);

  let revenue = 0;
  let cogs = 0;
  let expenses = 0;
  let assets = 0;
  let liabilities = 0;
  let cash = 0;

  for (const line of ledger || []) {

    const account = Array.isArray(line.chart_of_accounts)
      ? line.chart_of_accounts[0]
      : line.chart_of_accounts;

    const category = String(account?.category || "").toLowerCase();
    const accountCode = String(account?.code || "");

    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);

    if (category.includes("revenue")) revenue += credit - debit;
    if (category.includes("cogs")) cogs += debit - credit;
    if (category.includes("expense")) expenses += debit - credit;
    if (category.includes("asset")) assets += debit - credit;
    if (category.includes("liabil")) liabilities += credit - debit;
    if (accountCode === "1000") cash += debit - credit;
  }

  return NextResponse.json({
    success: true,
    organizationId,
    revenue,
    cogs,
    expenses,
    assets,
    liabilities,
    cash
  });
}
