import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function createAccountsPayableEntry({
  invoice,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'finance_accounts_payable'
    )
    .insert([
      {
        supplier_name:
          invoice.supplier_name,

        invoice_id:
          invoice.id,

        invoice_number:
          invoice.invoice_number,

        amount:
          invoice.total,

        status:
          'UNPAID',

        due_date:
          invoice.due_date || null,
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
