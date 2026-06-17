import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getMergedTableGroup({ tenantId, tableNumber }) {
  if (!tenantId || !tableNumber) return []

  // find all tables merged into this one (children)
  const { data: merges } = await supabaseAdmin
    .from('restaurant_table_merges')
    .select('merged_table_id')
    .eq('tenant_id', tenantId)
    .eq('master_table_id', tableNumber)

  const childTables = (merges || []).map(m => m.merged_table_id)

  return [tableNumber, ...childTables]
}
