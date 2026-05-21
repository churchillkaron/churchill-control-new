import { supabase } from '@/lib/shared/supabase/client'

export function createPOSRealtimeChannel({
  tenant_id,
  onInsert,
}) {

  return supabase
    .channel(
      `pos-events-${tenant_id}`
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table:
          'pos_realtime_events',
        filter:
          `tenant_id=eq.${tenant_id}`,
      },
      payload => {

        if (onInsert) {
          onInsert(payload.new)
        }
      }
    )
    .subscribe()
}
