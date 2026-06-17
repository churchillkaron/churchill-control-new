import { createServerSupabase } from "@/lib/shared/supabase/server";
export function buildJournalLinesFromEvent({
  eventType,
  accounts,
  amount,
  taxAmount = 0,
}) {
  const netAmount = Number(amount || 0) - Number(taxAmount || 0);

  if (eventType === "SALE_COMPLETED") {
    return [
      {
        accountId: accounts.cash,
        debit: amount,
        credit: 0,
        memo: "Cash received from sale",
      },
      {
        accountId: accounts.revenue,
        debit: 0,
        credit: netAmount,
        memo: "Sales revenue",
      },
      {
        accountId: accounts.vatPayable,
        debit: 0,
        credit: taxAmount,
        memo: "VAT payable",
      },
    ];
  }

  if (eventType === "AP_INVOICE_APPROVED") {
    return [
      {
        accountId: accounts.expense,
        debit: netAmount,
        credit: 0,
        memo: "Supplier expense",
      },
      {
        accountId: accounts.vatReceivable,
        debit: taxAmount,
        credit: 0,
        memo: "Input VAT",
      },
      {
        accountId: accounts.accountsPayable,
        debit: 0,
        credit: amount,
        memo: "Accounts payable",
      },
    ];
  }

  if (eventType === "PAYMENT_MADE") {
    return [
      {
        accountId: accounts.accountsPayable,
        debit: amount,
        credit: 0,
        memo: "Payable settled",
      },
      {
        accountId: accounts.cash,
        debit: 0,
        credit: amount,
        memo: "Cash paid",
      },
    ];
  }

  if (eventType === "PAYROLL_POSTED") {
    return [
      {
        accountId: accounts.payrollExpense,
        debit: amount,
        credit: 0,
        memo: "Payroll expense",
      },
      {
        accountId: accounts.cash,
        debit: 0,
        credit: amount,
        memo: "Payroll paid",
      },
    ];
  }

  if (eventType === "DEPRECIATION_RUN") {
    return [
      {
        accountId: accounts.depreciationExpense,
        debit: amount,
        credit: 0,
        memo: "Depreciation expense",
      },
      {
        accountId: accounts.accumulatedDepreciation,
        debit: 0,
        credit: amount,
        memo: "Accumulated depreciation",
      },
    ];
  }


  if (eventType === "COGS_POSTED") {
    return [
      {
        accountId: accounts.cogs,
        debit: amount,
        credit: 0,
        memo: "Cost of goods sold",
      },
      {
        accountId: accounts.inventory,
        debit: 0,
        credit: amount,
        memo: "Inventory reduction",
      },
    ];
  }


  throw new Error(`Unsupported accounting event type: ${eventType}`);
}
