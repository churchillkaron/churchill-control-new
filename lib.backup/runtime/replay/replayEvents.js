import {
  emitEvent,
} from '@/lib/shared/events/eventBus'

import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
replayEvents({

  tenantId,

  limit = 100,

}) {

  console.log(
    '[EVENT_REPLAY_RUNTIME]'
  )

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'workflow_logs'
    )
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .order(
      'created_at',
      {
        ascending: true,
      }
    )
    .limit(limit)

  if (error) {

    console.error(
      '[EVENT_REPLAY_ERROR]',
      error
    )

    return null

  }

  const results = []

  for (const log of data || []) {

    try {

      const result =
        await emitEvent(

          log.event,

          log.payload || {}

        )

      results.push({

        success: true,

        event:
          log.event,

        result,

      })

    } catch (error) {

      results.push({

        success: false,

        event:
          log.event,

        error:
          error.message,

      })

    }

  }

  return results

}
