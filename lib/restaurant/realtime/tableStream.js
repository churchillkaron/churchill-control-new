import { supabase } from '@/lib/shared/supabase/client'

export function subscribeTableUpdates(tenantId, callback) {
  return supabase
    .channel('restaurant_tables_realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'restaurant_tables',
        filter: `tenant_id=eq.${tenantId}`
      },
      (payload) => callback(payload)
    )
    .subscribe()
}

export function subscribeOrderUpdates(tenantId, callback) {
  return supabase
    .channel('orders_realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `tenant_id=eq.${tenantId}`
      },
      (payload) => callback(payload)
    )
    .subscribe()
}
