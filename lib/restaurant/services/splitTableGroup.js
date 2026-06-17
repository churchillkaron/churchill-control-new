import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function splitTableGroup({ tenantId, masterTableId }) {
  if (!tenantId || !masterTableId) return

  // remove merge relationships
  await supabaseAdmin
    .from('restaurant_table_merges')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('master_table_id', masterTableId)

  // reset table statuses safely
  await supabaseAdmin
    .from('restaurant_tables')
    .update({
      status: 'AVAILABLE',
      current_guests: 0,
      active_session_id: null,
      updated_at: new Date().toISOString()
    })
    .eq('tenant_id', tenantId)
    .eq('status', 'MERGED')

  return { success: true }
}
