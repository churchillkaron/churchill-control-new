import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function approveSupplierInvoice({
  invoice_id,
  approved_by,
  notes,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'production_supplier_invoices'
    )
    .update({
      status:
        'APPROVED',

      approved_by,

      approval_notes:
        notes,

      approved_at:
        new Date()
          .toISOString(),
    })
    .eq(
      'id',
      invoice_id
    )
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
