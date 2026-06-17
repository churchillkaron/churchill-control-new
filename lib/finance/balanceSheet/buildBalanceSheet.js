import { createServerSupabase } from "@/lib/shared/supabase/server";
export function buildBalanceSheet({
  cashflow = {},
  inventory = [],
  payables = [],
}) {

  const inventoryValue =
    inventory.reduce(
      (
        sum,
        ingredient
      ) =>
        sum +
        (
          Number(
            ingredient.stock || 0
          ) *
          Number(
            ingredient.cost_per_unit || 0
          )
        ),
      0
    )

  const accountsPayable =
    payables
      .filter(
        payable =>
          payable.status !==
          'PAID'
      )
      .reduce(
        (
          sum,
          payable
        ) =>
          sum +
          Number(
            payable.amount || 0
          ),
        0
      )

  const cash =
    Number(
      cashflow.net_cashflow || 0
    )

  const totalAssets =
    cash +
    inventoryValue

  const totalLiabilities =
    accountsPayable

  const equity =
    totalAssets -
    totalLiabilities

  return {

    assets: {

      cash:
        Number(
          cash.toFixed(2)
        ),

      inventory:
        Number(
          inventoryValue.toFixed(2)
        ),

      total_assets:
        Number(
          totalAssets.toFixed(2)
        ),
    },

    liabilities: {

      accounts_payable:
        Number(
          accountsPayable.toFixed(2)
        ),

      total_liabilities:
        Number(
          totalLiabilities.toFixed(2)
        ),
    },

    equity:
      Number(
        equity.toFixed(2)
      ),
  }
}
