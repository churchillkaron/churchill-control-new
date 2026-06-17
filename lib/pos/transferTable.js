import { supabase } from '@/lib/shared/supabase/client'

export async function transferTable({
  tenantId,
  fromTableId,
  toTableId,
  transferredBy = 'SYSTEM',
  reason = 'Table transfer',
}) {
  if (!tenantId) return
  if (!fromTableId || !toTableId) {
    throw new Error('fromTableId and toTableId required')
  }

  await supabase
    .from('orders')
    .update({
      table_id: toTableId,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('table_id', fromTableId)

  await supabase
    .from('order_items')
    .update({
      table_id: toTableId,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('table_id', fromTableId)

  await supabase
    .from('table_sessions')
    .update({
      table_id: toTableId,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('table_id', fromTableId)

  return { success: true }
}
