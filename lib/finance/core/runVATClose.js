import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

import { calculateVATLiability } from "./calculateVATLiability";
import { postJournalEntrySafe } from "./postJournalEntrySafe";

export async function runVATClose({
  tenantId,
  filingPeriod,
  startDate,
  endDate,
  vatPayableAccountId,
  vatReceivableAccountId,
  taxSettlementAccountId,
}) {
  const tax =
    await calculateVATLiability({
      tenantId,
      startDate,
      endDate,
    });

  const net =
    Number(tax.netVAT || 0);

  const journal =
    await postJournalEntrySafe({
      tenantId,
      entryDate: endDate,
      description:
        "VAT settlement closing",
      reference:
        "VAT_CLOSE",
      lines: [
        {
          accountId:
            vatPayableAccountId,
          debit:
            tax.vatPayable,
          credit: 0,
          memo:
            "Close VAT payable",
        },
        {
          accountId:
            vatReceivableAccountId,
          debit: 0,
          credit:
            tax.vatReceivable,
          memo:
            "Close VAT receivable",
        },
        {
          accountId:
            taxSettlementAccountId,
          debit:
            net < 0
              ? Math.abs(net)
              : 0,
          credit:
            net > 0
              ? net
              : 0,
          memo:
            "VAT settlement",
        },
      ],
    });

  const { data, error } =
    await supabase
      .from("tax_filings")
      .insert({
        tenant_id: tenantId,
        filing_type: "VAT",
        filing_period:
          filingPeriod,
        tax_payable:
          tax.vatPayable,
        tax_receivable:
          tax.vatReceivable,
        net_tax: net,
        filing_status:
          "prepared",
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return {
    filing: data,
    journal,
  };
}
