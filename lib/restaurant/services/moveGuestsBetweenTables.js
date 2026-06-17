import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function moveGuestsBetweenTables({
  tenantId,
  fromTableId,
  toTableId,
  guestCount
}) {
  if (!tenantId) return
  if (!fromTableId || !toTableId) {
    throw new Error('fromTableId and toTableId required')
  }

  // decrease source
  await supabaseAdmin
    .from('restaurant_tables')
    .update({
      current_guests: supabaseAdmin.raw(
        `GREATEST(current_guests - ${guestCount}, 0)`
      ),
      updated_at: new Date().toISOString()
    })
    .eq('tenant_id', tenantId)
    .eq('id', fromTableId)

  // increase target
  await supabaseAdmin
    .from('restaurant_tables')
    .update({
      current_guests: supabaseAdmin.raw(
        `current_guests + ${guestCount}`
      ),
      updated_at: new Date().toISOString()
    })
    .eq('tenant_id', tenantId)
    .eq('id', toTableId)

  return { success: true }
}
