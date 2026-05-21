import {
  postJournalEntry,
} from '@/lib/finance/services/postJournalEntry'

import {
  getServiceSupabase,
} from '@/lib/shared/supabase/service'

export async function financeHandler(payload) {

  const supabase =
    getServiceSupabase()

  const {
    tenantId,
    orderId,
    totalRevenue = 0,
    inventory,
  } = payload

  if (!tenantId || !orderId) {

    throw new Error(
      'financeHandler requires tenantId and orderId'
    )

  }

  const revenue =
    Number(
      totalRevenue ||
      payload.revenue ||
      0
    )

  const cogs =
    Number(
      inventory?.totalCost || 0
    )

  const journal = {

    tenant_id:
      tenantId,

    source:
      'POS_ORDER_COMPLETED',

    source_id:
      orderId,

    description:
      `POS order completed: ${orderId}`,

    total_debit:
      revenue + cogs,

    total_credit:
      revenue + cogs,

    status:
      'draft',

    created_at:
      new Date().toISOString(),

  }

  const {
    data: journalEntry,
    error: journalError,
  } = await supabase

    .from('journal_entries')

    .insert(journal)

    .select('*')

    .single()

  if (journalError) {

    throw new Error(
      journalError.message
    )

  }

  const lines = [

    {
      tenant_id: tenantId,
      journal_entry_id: journalEntry.id,
      account_code: '1000',
      account_name: 'Cash / POS Clearing',
      debit: revenue,
      credit: 0,
      created_at: new Date().toISOString(),
    },

    {
      tenant_id: tenantId,
      journal_entry_id: journalEntry.id,
      account_code: '4000',
      account_name: 'Sales Revenue',
      debit: 0,
      credit: revenue,
      created_at: new Date().toISOString(),
    },

    {
      tenant_id: tenantId,
      journal_entry_id: journalEntry.id,
      account_code: '5000',
      account_name: 'Cost of Goods Sold',
      debit: cogs,
      credit: 0,
      created_at: new Date().toISOString(),
    },

    {
      tenant_id: tenantId,
      journal_entry_id: journalEntry.id,
      account_code: '1200',
      account_name: 'Inventory',
      debit: 0,
      credit: cogs,
      created_at: new Date().toISOString(),
    },

  ]

  const {
    error: lineError,
  } = await supabase

    .from('journal_entry_lines')

    .insert(lines)

  if (lineError) {

    throw new Error(
      lineError.message
    )

  }

  const posting =
    await postJournalEntry({

      tenantId,

      journalEntryId:
        journalEntry.id,

    })

  return {

    success: true,

    journalEntryId:
      journalEntry.id,

    posting,

    revenue,

    cogs,

    grossProfit:
      revenue - cogs,

  }

}
