import { supabase } from '@/lib/shared/supabase/client'

export function subscribeTableUpdates(organizationId, callback) {
  return supabase
    .channel('restaurant_tables_realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'restaurant_tables',
        filter: `organization_id=eq.${organizationId}`
      },
      (payload) => callback(payload)
    )
    .subscribe()
}

export function subscribeOrderUpdates(organizationId, callback) {
  return supabase
    .channel('orders_realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `organization_id=eq.${organizationId}`
      },
      (payload) => callback(payload)
    )
    .subscribe()
}
