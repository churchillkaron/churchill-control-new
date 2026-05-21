import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function openTable({
  tenant_id,
  table_id,
  opened_by,
  guests = 1,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('restaurant_tables')
    .update({
      status: 'OCCUPIED',
      current_guests:
        guests,
      opened_by,
      opened_at:
        new Date()
          .toISOString(),
    })
    .eq('id', table_id)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
