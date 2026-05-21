import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function payAccountsPayable({
  payable_id,
  payment_method,
  paid_by,
  reference_number,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'finance_accounts_payable'
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
