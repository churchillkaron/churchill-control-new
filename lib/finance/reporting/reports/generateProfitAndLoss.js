import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase }
from '@/lib/shared/supabase/client'

export async function
generateProfitAndLoss({

  organizationId,

}) {

  const {
    data,
    error,
  } = await supabase
    .from(
      'general_ledger'
    )
    .select('*')
    .eq(
      'organization_id',
      organizationId

    )

  if (error) {

    console.error(
      '[P&L_ERROR]',
      error
    )

    return null
  }

  let revenue = 0
  let cogs = 0
  let expenses = 0

  for (const row of data || []) {

    const balance =
      Number(
        row.balance || 0
      )

    const account =
      String(
        row.account || ''
      ).toLowerCase()

    if (
      account.includes(
        'revenue'
      )
    ) {

      revenue += balance

    } else if (
      account.includes(
        'cogs'
      )
    ) {

      cogs += balance

    } else {

      expenses += balance

    }

  }

  const grossProfit =
    revenue - cogs

  const netProfit =
    grossProfit - expenses

  return {

    revenue,

    cogs,

    grossProfit,

    expenses,

    netProfit,

  }

}
