import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");

  if (!tenantId) {
    return Response.json(
      { success: false, error: "Missing tenantId" },
      { status: 400 }
    );
  }

  // PROFILE (accounting firm config)
  const { data: profile } = await supabaseAdmin
    .from("organization_accounting_profiles")
    .select("*")
    .eq("organization_id", tenantId)
    .maybeSingle();

  // VAT + TAX FILINGS
  const { data: filings } = await supabaseAdmin
    .from("tax_filings")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  // TAX REPORTS
  const { data: reports } = await supabaseAdmin
    .from("finance_tax_reports")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  // LEDGER SUMMARY (lightweight KPI layer)
  const { data: ledger } = await supabaseAdmin
    .from("general_ledger")
    .select("amount, entry_type, account_name")
    .eq("tenant_id", tenantId)
    .limit(200);

  let revenue = 0;
  let expense = 0;

  for (const l of ledger || []) {
    const name = (l.account_name || "").toLowerCase();
    const amount = Number(l.amount || 0);

    if (name.includes("revenue")) revenue += amount;
    if (name.includes("expense")) expense += amount;
  }

  return Response.json({
    success: true,
    profile,
    filings: filings || [],
    reports: reports || [],
    kpis: {
      revenue,
      expense,
      profit: revenue - expense
    }
  });
}
