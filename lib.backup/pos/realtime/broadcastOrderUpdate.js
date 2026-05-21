import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function broadcastOrderUpdate({
  tenant_id,
  event,
  payload,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('pos_realtime_events')
    .insert([
      {
        tenant_id,
        event,
        payload,
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
