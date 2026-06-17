import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
updateLedgerBalances({

  tenantId,

  lines = [],

}) {

  for (const line of lines) {

    const account =
      line.account

    const debit =
      Number(
        line.debit || 0
      )

    const credit =
      Number(
        line.credit || 0
      )

    const {
      data: existing,
    } = await supabaseAdmin
      .from(
        'general_ledger'
      )
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      )
      .eq(
        'account',
        account
      )
      .single()

    if (!existing) {

      await supabaseAdmin
        .from(
          'general_ledger'
        )
        .insert({

          tenant_id:
            tenantId,

          account,

          balance:
            debit - credit,

        })

      continue
    }

    const nextBalance =
      Number(
        existing.balance || 0
      ) +
      debit -
      credit

    await supabaseAdmin
      .from(
        'general_ledger'
      )
      .update({

        balance:
          nextBalance,

      })
      .eq(
        'id',
        existing.id
      )

  }

}
