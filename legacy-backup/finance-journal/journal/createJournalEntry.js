import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

import {
  updateLedgerBalances,
} from '@/lib/finance/ledger/updateLedgerBalances'

export async function
createJournalEntry({

  tenantId,

  referenceType,

  referenceId,

  lines = [],

}) {

  console.log(
    '[JOURNAL_RUNTIME]'
  )

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'journal_entries'
    )
    .insert({

      tenant_id:
        tenantId,

      reference_type:
        referenceType,

      reference_id:
        referenceId,

      lines,

      status:
        'POSTED',

    })
    .select()
    .single()

  if (error) {

    console.error(
      '[JOURNAL_ERROR]',
      error
    )

    return null
  }

  // ===== LEDGER UPDATE =====

  await updateLedgerBalances({

    tenantId,

    lines,

  })

  return data

}
