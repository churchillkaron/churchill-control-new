import { supabase } from '@/lib/shared/supabase/client'

export function createKitchenRealtimeChannel({
  tenantId,
  onQueueInsert,
  onQueueUpdate,
  onTicketUpdate,
  onAlertInsert,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  const channel =
    supabase.channel(
      `kitchen-live-${tenantId}`
    )

  /*
  |--------------------------------------------------------------------------
  | Kitchen Queue INSERT
  |--------------------------------------------------------------------------
  */

  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'kitchen_queue',
      filter:
        `tenant_id=eq.${tenantId}`,
    },
    payload => {

      if (
        onQueueInsert
      ) {

        onQueueInsert(
          payload.new
        )
      }
    }
  )

  /*
  |--------------------------------------------------------------------------
  | Kitchen Queue UPDATE
  |--------------------------------------------------------------------------
  */

  channel.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'kitchen_queue',
      filter:
        `tenant_id=eq.${tenantId}`,
    },
    payload => {

      if (
        onQueueUpdate
      ) {

        onQueueUpdate(
          payload.new
        )
      }
    }
  )

  /*
  |--------------------------------------------------------------------------
  | Kitchen Ticket UPDATE
  |--------------------------------------------------------------------------
  */

  channel.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'kitchen_tickets',
      filter:
        `tenant_id=eq.${tenantId}`,
    },
    payload => {

      if (
        onTicketUpdate
      ) {

        onTicketUpdate(
          payload.new
        )
      }
    }
  )

  /*
  |--------------------------------------------------------------------------
  | Predictive Alert INSERT
  |--------------------------------------------------------------------------
  */

  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table:
        'kitchen_predictive_alerts',
      filter:
        `tenant_id=eq.${tenantId}`,
    },
    payload => {

      if (
        onAlertInsert
      ) {

        onAlertInsert(
          payload.new
        )
      }
    }
  )

  channel.subscribe()

  return channel
}
