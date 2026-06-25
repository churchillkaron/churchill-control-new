import { runVATClose } from "@/lib/finance/reporting/runVATClose";
import { generatePP30 } from "@/lib/finance/reporting/thailand/generatePP30";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * FULL ACCOUNTING FIRM MONTHLY CLOSE
 */
export async function runMonthlyClose({
  tenantId,
  organizationId,
  periodStart,
  periodEnd,
  vatPayableAccountId,
  vatReceivableAccountId,
  taxSettlementAccountId
}) {

  // 1. VAT CLOSE (ledger posting)
  const vat = await runVATClose({
    tenantId,
    organizationId,
    filingPeriod: `${periodStart}_${periodEnd}`,
    startDate: periodStart,
    endDate: periodEnd,
    vatPayableAccountId,
    vatReceivableAccountId,
    taxSettlementAccountId
  });

  // 2. PP30 GENERATION
  const pp30 = await generatePP30({
    tenantId,
    periodStart,
    periodEnd
  });

  // 3. CREATE FILING RECORD (DRAFT → REVIEW)
  const { data: filing } = await supabaseAdmin
    .from("tax_filings")
    .insert({
      tenant_id: tenantId,
      filing_type: "VAT",
      period_start: periodStart,
      period_end: periodEnd,
      status: "REVIEW",
      tax_payable: pp30.outputVAT,
      tax_receivable: pp30.inputVAT,
      net_tax: pp30.netVAT
    })
    .select()
    .single();

  return {
    success: true,
    vat,
    pp30,
    filing
  };
}
