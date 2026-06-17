import { supabaseAdmin } from '@/lib/shared/supabase/admin'
import { getMergedTableGroup } from './getMergedTableGroup'

export async function getLiveTableState({ tenantId, tableNumber }) {
  const group = await getMergedTableGroup({ tenantId, tableNumber })

  const { data: tables } = await supabaseAdmin
    .from('restaurant_tables')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('table_number', group)

  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('table_number', group)
    .eq('status', 'OPEN')

  return {
    tables,
    orders,
    merged: true
  }
}
