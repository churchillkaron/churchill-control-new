import { getServiceSupabase } from '@/lib/shared/supabase/service'
import { getActiveTableSession } from './getActiveTableSession'

const supabase = getServiceSupabase()

export async function openTableSession({
  tenantId,

  tableId,
  tableNumber,

  customerId = null,
  customerName = null,
  customerEmail = null,
  customerPhone = null,

  guestCount = 0,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  // =========================
  // FIND ACTIVE SESSION (ID FIRST)
  // =========================
  const existing = await getActiveTableSession({
    tenantId,
    tableId,
    tableNumber,
  })

  // =========================
  // UPDATE EXISTING SESSION
  // =========================
  if (existing) {
    const { data, error } = await supabase
      .from('table_sessions')
      .update({
        customer_id: customerId || existing.customer_id,
        customer_name: customerName || existing.customer_name,
        customer_email: customerEmail || existing.customer_email,
        customer_phone: customerPhone || existing.customer_phone,
        guest_count: Number(guestCount || existing.guest_count || 0),
        guests: Number(guestCount || existing.guests || 0),

        table_id: tableId || existing.table_id,
        table_number: tableNumber || existing.table_number,

        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  // =========================
  // FIND TABLE (ID FIRST)
  // =========================
  const query = supabase
    .from('restaurant_tables')
    .select('*')
    .eq('tenant_id', tenantId)

  const { data: tables, error: tableError } = tableId
    ? await query.eq('id', tableId).limit(1)
    : await query.eq('table_number', tableNumber).limit(1)

  if (tableError || !tables?.length) {
    throw new Error('Restaurant table not found')
  }

  const table = tables[0]

  // =========================
  // CREATE SESSION
  // =========================
  const { data, error } = await supabase
    .from('table_sessions')
    .insert({
      tenant_id: tenantId,

      customer_id: customerId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,

      table_id: table.id,
      table_number: table.table_number,

      guest_count: Number(guestCount || 0),
      guests: Number(guestCount || 0),

      status: 'OPEN',
      revenue: 0,
      orders: 0,

      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  // =========================
  // UPDATE TABLE STATUS
  // =========================
  await supabase
    .from('restaurant_tables')
    .update({
      status: 'OCCUPIED',
      current_guests: Number(guestCount || 0),
      active_session_id: data.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', table.id)

  return data
}
