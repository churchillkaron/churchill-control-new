import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function saveHoldOrder({
  tenant_id,
  order_id,
  held_by,
  reason,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('pos_hold_orders')
    .insert([
      {
        tenant_id,
        order_id,
        held_by,
        reason,
        status: 'ON_HOLD',
        held_at:
          new Date()
            .toISOString(),
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  await supabaseAdmin
    .from('orders')
    .update({
      status: 'ON_HOLD',
    })
    .eq('id', order_id)

  return data
}
