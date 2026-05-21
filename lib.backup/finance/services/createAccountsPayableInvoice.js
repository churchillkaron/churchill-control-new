import { createClient } from '@supabase/supabase-js'

import {
  postJournalEntry,
} from './postJournalEntry'

const supabase =
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

export async function createAccountsPayableInvoice({
  tenantId,
  purchaseOrderId,
}) {

  if (!tenantId || !purchaseOrderId) {
    throw new Error(
      'tenantId and purchaseOrderId required'
    )
  }

  const {
    data: purchaseOrder,
    error: poError,
  } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', purchaseOrderId)
    .single()

  if (poError || !purchaseOrder) {
    throw new Error('Purchase order not found')
  }

  const {
    data: lines,
    error: lineError,
  } = await supabase
    .from('purchase_order_lines')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('purchase_order_id', purchaseOrderId)

  if (lineError) {
    throw new Error(lineError.message)
  }

  const total =
    (lines || []).reduce(
      (sum, line) =>
        sum +
        Number(line.total_cost || 0),
      0
    )

  const invoice = {

    tenant_id:
      tenantId,

    purchase_order_id:
      purchaseOrderId,

    supplier_id:
      purchaseOrder.supplier_id,

    status:
      'pending_payment',

    subtotal:
      total,

    total,

    balance_due:
      total,

    created_at:
      new Date().toISOString(),

  }

  const {
    data: apInvoice,
    error: invoiceError,
  } = await supabase
    .from('vendor_invoices')
    .insert(invoice)
    .select('*')
    .single()

  if (invoiceError) {
    throw new Error(invoiceError.message)
  }

  const journal = {

    tenant_id:
      tenantId,

    source:
      'AP_INVOICE',

    source_id:
      apInvoice.id,

    description:
      `AP invoice for PO ${purchaseOrderId}`,

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
    throw new Error(journalError.message)
  }

  const journalLines = [

    {
      tenant_id:
        tenantId,

      journal_entry_id:
        journalEntry.id,

      account_code:
        '1200',

      account_name:
        'Inventory',

      debit:
        total,

      credit:
        0,

      created_at:
        new Date().toISOString(),

    },

    {
      tenant_id:
        tenantId,

      journal_entry_id:
        journalEntry.id,

      account_code:
        '2000',

      account_name:
        'Accounts Payable',

      debit:
        0,

      credit:
        total,

      created_at:
        new Date().toISOString(),

    },

  ]

  await supabase
    .from('journal_entry_lines')
    .insert(journalLines)

  await postJournalEntry({

    tenantId,

    journalEntryId:
      journalEntry.id,

  })

  await supabase
    .from('purchase_orders')
    .update({

      ap_invoice_id:
        apInvoice.id,

      updated_at:
        new Date().toISOString(),

    })
    .eq('tenant_id', tenantId)
    .eq('id', purchaseOrderId)

  return {

    success: true,

    invoice:
      apInvoice,

    journalEntryId:
      journalEntry.id,

  }
}
