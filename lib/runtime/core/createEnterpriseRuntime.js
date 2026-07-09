import { supabase }
from '@/lib/shared/supabase/client'

import {
  processEnterpriseRuntimeEvent,
} from '@/lib/runtime/core/processEnterpriseRuntimeEvent'

export function createEnterpriseRuntime({

  tenantId,

  onEvent,

}) {

  const channel =
    supabase.channel(
      `enterprise-runtime-${tenantId}`
    )

  channel.on(

    'broadcast',

    {

      event: '*',

    },

    async payload => {

      if (process.env.NODE_ENV !== "production") console.log(
        '[ENTERPRISE_RUNTIME]',
        payload
      )

      const event =
        payload?.event

      const data =
        payload?.payload || {}

      const result =
        await processEnterpriseRuntimeEvent({

          tenantId,

          event,

          payload:
            data,

        })

      if (onEvent) {

        onEvent({

          payload,

          result,

        })

      }

    }

  )

  channel.subscribe(status => {

    if (process.env.NODE_ENV !== "production") console.log(
      '[RUNTIME_STATUS]',
      status
    )

  })

  return {

    channel,

    unsubscribe() {

      supabase.removeChannel(
        channel
      )

    },

  }

}
