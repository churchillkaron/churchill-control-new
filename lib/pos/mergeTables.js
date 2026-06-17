import { supabase } from '@/lib/shared/supabase/client'
import loadOperationalSettings from '@/lib/settings/loadOperationalSettings'
import { getActiveTableSession } from '@/lib/restaurant/services/getActiveTableSession'

export async function mergeTables({
  tenantId,
  sourceTableId,
  targetTableId,
  mergedBy = 'SYSTEM',
}) {
  if (!tenantId) return
  if (!sourceTableId || !targetTableId) {
    throw new Error('sourceTableId and targetTableId required')
  }

  const settings = await loadOperationalSettings({
    tenantId,
    domain: 'TABLES',
  })

  if (!settings?.allow_table_merge) {
    throw new Error('Table merge disabled')
  }

  const sourceSession = await getActiveTableSession({
    tenantId,
    tableId: sourceTableId,
  })

  const targetSession = await getActiveTableSession({
    tenantId,
    tableId: targetTableId,
  })

  if (!sourceSession || !targetSession) {
    throw new Error('Sessions not found')
  }

  await supabase
    .from('orders')
    .update({
      table_id: targetTableId,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('table_id', sourceTableId)

  await supabase
    .from('order_items')
    .update({
      table_id: targetTableId,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('table_id', sourceTableId)

  const mergedRevenue =
    Number(sourceSession.revenue || 0) +
    Number(targetSession.revenue || 0)

  const mergedOrders =
    Number(sourceSession.orders || 0) +
    Number(targetSession.orders || 0)

  await supabase
    .from('table_sessions')
    .update({
      revenue: mergedRevenue,
      orders: mergedOrders,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', targetSession.id)

  return { success: true }
}
