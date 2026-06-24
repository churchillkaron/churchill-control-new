import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function payAccountsPayable({
  payable_id,
  payment_method,
  paid_by,
  reference_number,
}) {

  const {
    data: existing,
    error: existingError,
  } = await supabaseAdmin
    .from('accounts_payable')
    .select('*')
    .eq('id', payable_id)
    .single()

  if (existingError) {
    throw existingError
  }

  if (existing.status === 'PAID') {
    throw new Error('ALREADY_PAID')
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'accounts_payable'
    )
    .update({
      status:
        'PAID',

      payment_method,

      paid_by,

      reference_number,

      paid_at:
        new Date()
          .toISOString(),
    })
    .eq(
      'id',
      payable_id
    )
    .select()
    .single()

  if (error) {
    throw error
  }

  await supabaseAdmin
    .from(
      'finance_payment_logs'
    )
    .insert([
      {
        payable_id,

        amount:
          data.amount,

        payment_method,

        reference_number,

        paid_by,
      },
    ])

  return data
}
