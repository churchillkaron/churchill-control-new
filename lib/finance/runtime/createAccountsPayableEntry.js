import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

import {
  createJournalEntry,
} from '@/lib/finance/accounting/createJournalEntry'

export async function
createAccountsPayableEntry({

  tenantId,

  purchaseOrder,

  createdBy = 'system',

}) {

  console.log(
    '[FINANCE_RUNTIME_AP]'
  )

  const totalAmount =
    Number(
      purchaseOrder?.total_amount || 0
    )

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'accounts_payable'
    )
    .insert({

      tenant_id:
        tenantId,

      purchase_order_id:
        purchaseOrder?.id,

      status:
        'PENDING',

      total_amount:
        totalAmount,

      payload:
        purchaseOrder,

    })
    .select()
    .single()

  if (error) {

    console.error(
      '[AP_ENTRY_ERROR]',
      error
    )

    return null

  }

  // ===== ERP JOURNAL ENTRY =====

  await createJournalEntry({

    tenantId,

    entryDate:
      new Date()
        .toISOString(),

    description:
      `AP created for PO ${purchaseOrder?.id}`,

    sourceType:
      'PURCHASE_ORDER',

    sourceId:
      purchaseOrder?.id,

    createdBy,

    lines: [

      {

        account_id:
          'INVENTORY',

        debit:
          totalAmount,

        credit:
          0,

        description:
          'Inventory increase',

      },

      {

        account_id:
          'ACCOUNTS_PAYABLE',

        debit:
          0,

        credit:
          totalAmount,

        description:
          'Accounts payable liability',

      },

    ],

  })

  return data

}
