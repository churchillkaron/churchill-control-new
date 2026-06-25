import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { calculateVATLiability } from "./calculateVATLiability";
import { generateTaxReport } from "./generateTaxReport";

export async function runVATClose(params) {

  const {
    organizationId,
    tenantId,
    filingPeriod,
    startDate,
    endDate,
    vatPayableAccountId,
    vatReceivableAccountId,
    taxSettlementAccountId
  } = params;

  const tax = await calculateVATLiability({
    tenantId,
    startDate,
    endDate
  });

  const net = Number(tax.netVAT || 0);

  // 1. VAT JOURNAL
  const journal = await supabaseAdmin
    .from("journal_entries")
    .insert({
      tenant_id: tenantId,
      description: "VAT settlement closing",
      reference_type: "VAT_CLOSE"
    })
    .select()
    .single();

  await supabaseAdmin.from("journal_entry_lines").insert([
    {
      journal_entry_id: journal.data.id,
      account_id: vatPayableAccountId,
      debit: tax.vatPayable,
      credit: 0
    },
    {
      journal_entry_id: journal.data.id,
      account_id: vatReceivableAccountId,
      debit: 0,
      credit: tax.vatReceivable
    }
  ]);

  // 2. TAX FILING
  await supabaseAdmin.from("tax_filings").insert({
    tenant_id: tenantId,
    organization_id: organizationId,
    filing_type: "VAT",
    filing_period: filingPeriod,
    tax_payable: tax.vatPayable,
    tax_receivable: tax.vatReceivable,
    net_tax: net,
    filing_status: "completed"
  });

  // 3. TAX REPORT (NEW)
  const report = await generateTaxReport({
    organizationId,
    tenantId,
    periodStart: startDate,
    periodEnd: endDate,
    reportType: "VAT_RETURN"
  });

  return {
    success: true,
    journal: journal.data,
    filing: true,
    report: report.report
  };
}
