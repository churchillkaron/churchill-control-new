import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function registerTerminal({
  organization_id,
  terminal_id,
  terminal_name,
  device_info = {},
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('pos_terminals')
    .upsert([
      {
        organization_id,
        terminal_id,
        terminal_name,
        device_info,
        status: 'ONLINE',
        last_seen_at:
          new Date()
            .toISOString(),
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
