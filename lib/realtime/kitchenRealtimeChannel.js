import { supabase } from '@/lib/shared/supabase/client'

export function createKitchenRealtimeChannel({
  tenantId,
  onOrderInsert,
  onOrderUpdate,
  onOrderItemInsert,
  onOrderItemUpdate,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  const channel =
    supabase.channel(
      `restaurant-live-${tenantId}`
    )

  /*
  |--------------------------------------------------------------------------
  | ORDERS INSERT
  |--------------------------------------------------------------------------
  */

  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      service_unit: 'orders',
      filter:
        `tenant_id=eq.${tenantId}`,
    },
    payload => {

      if (
        onOrderInsert
      ) {

        onOrderInsert(
          payload.new
        )
      }
    }
  )

  /*
  |--------------------------------------------------------------------------
  | ORDERS UPDATE
  |--------------------------------------------------------------------------
  */

  channel.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      service_unit: 'orders',
      filter:
        `tenant_id=eq.${tenantId}`,
    },
    payload => {

      if (
        onOrderUpdate
      ) {

        onOrderUpdate(
          payload.new
        )
      }
    }
  )

  /*
  |--------------------------------------------------------------------------
  | ORDER ITEMS INSERT
  |--------------------------------------------------------------------------
  */

  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      service_unit: 'order_items',
      filter:
        `tenant_id=eq.${tenantId}`,
    },
    payload => {

      if (
        onOrderItemInsert
      ) {

        onOrderItemInsert(
          payload.new
        )
      }
    }
  )

  /*
  |--------------------------------------------------------------------------
  | ORDER ITEMS UPDATE
  |--------------------------------------------------------------------------
  */

  channel.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      service_unit: 'order_items',
      filter:
        `tenant_id=eq.${tenantId}`,
    },
    payload => {

      if (
        onOrderItemUpdate
      ) {

        onOrderItemUpdate(
          payload.new
        )
      }
    }
  )

  channel.subscribe()

  return channel
}
