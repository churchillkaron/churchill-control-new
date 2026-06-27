import { supabase } from '@/lib/shared/supabase/client'

export function createPOSRealtimeChannel({
  organization_id,
  onInsert,
}) {

  return supabase
    .channel(
      `pos-events-${organization_id}`
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table:
          'pos_realtime_events',
        filter:
          `organization_id=eq.${organization_id}`,
      },
      payload => {

        if (onInsert) {
          onInsert(payload.new)
        }
      }
    )
    .subscribe()
}
