import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function processOfflineOrders(
  orders = []
) {

  const results = []

  for (const order of orders) {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('orders')
      .insert([
        {
          organization_id:
            order.organization_id,

          table_id:
            order.table_id,

          status:
            status ||
            'OPEN',

          source:
            'OFFLINE_SYNC',

          synced_at:
            new Date()
              .toISOString(),
        },
      ])
      .select()
      .single()

    if (error) {
      throw error
    }

    results.push(data)
  }

  return results
}
