import { createServerSupabase } from "@/lib/shared/supabase/server";
export function buildFinancialConsolidation({
  pnl = {},
  balanceSheet = {},
  cashflow = {},
  tax = {},
}) {

  return {

    profit_and_loss: {

      revenue:
        pnl.revenue || 0,

      net_profit:
        pnl.net_profit || 0,

      cogs:
        pnl.cogs || 0,

      operating_expenses:
        pnl.operating_expenses || 0,
    },

    balance_sheet: {

      assets:
        balanceSheet.assets
          ?.total_assets || 0,

      liabilities:
        balanceSheet
          .liabilities
          ?.total_liabilities || 0,

      equity:
        balanceSheet
          .equity || 0,
    },

    cashflow: {

      incoming:
        cashflow.incoming || 0,

      outgoing:
        cashflow.outgoing || 0,

      net_cashflow:
        cashflow.net_cashflow || 0,
    },

    tax: {

      output_tax:
        tax.output_tax || 0,

      input_tax:
        tax.input_tax || 0,

      tax_payable:
        tax.tax_payable || 0,
    },

    financial_health: {

      profitable:
        (
          pnl.net_profit || 0
        ) > 0,

      positive_cashflow:
        (
          cashflow.net_cashflow || 0
        ) > 0,

      positive_equity:
        (
          balanceSheet
            .equity || 0
        ) > 0,
    },
  }
}
