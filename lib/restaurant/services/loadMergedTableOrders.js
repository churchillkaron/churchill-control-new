import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function loadMergedTableOrders({ tenantId, tableNumber }) {
  if (!tenantId || !tableNumber) return []

  // 1. get all merged children
  const { data: merges } = await supabaseAdmin
    .from('restaurant_table_merges')
    .select('merged_table_id')
    .eq('tenant_id', tenantId)
    .eq('master_table_id', tableNumber)

  const childTables = (merges || []).map(m => m.merged_table_id)

  const allTables = [tableNumber, ...childTables]

  // 2. load all orders for all merged tables
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('table_number', allTables)
    .eq('status', 'OPEN')

  return orders || []
}
