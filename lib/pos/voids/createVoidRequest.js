import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function createVoidRequest({
  organization_id,
  order_id,
  order_item_id,
  reason,
  requested_by,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('void_requests')
    .insert([
      {
        organization_id,
        order_id,
        order_item_id,
        reason,
        requested_by,
        status: 'PENDING',
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
