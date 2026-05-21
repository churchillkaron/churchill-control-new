import {
  runWorkflows,
} from '@/lib/workflows/runWorkflows'

import broadcastEvent
from '@/lib/realtime/broadcastEvent'

import {
  processEnterpriseEvent,
} from '@/lib/ai/runtime/processEnterpriseEvent'

import {
  detectEnterpriseSignals,
} from '@/lib/signals/detectEnterpriseSignals'

const listeners = {}

export function registerEvent(
  event,
  handler
) {

  if (!listeners[event]) {

    listeners[event] = []

  }

  listeners[event].push(
    handler
  )
}

export async function emitEvent(
  event,
 payload = {}
) {

  console.log(
    '[EVENT_EMIT]',
    event
  )

  const handlers =
    listeners[event] || []

  const handlerResults = []

  for (const handler of handlers) {

    try {

      const result =
        await handler(payload)

      handlerResults.push({

        success: true,

        result,

      })

    } catch (error) {

      console.error(
        `[EVENT_HANDLER_FAILED] ${event}`,
        error
      )

      handlerResults.push({

        success: false,

        error:
          error.message,

      })
    }
  }

  const workflowResults =
    await runWorkflows(
      event,
      payload
    )

  let aiResult = null

  try {

    aiResult =
      await processEnterpriseEvent({

        event,

        payload,

      })

  } catch (error) {

    console.error(
      '[AI_RUNTIME_ERROR]',
      error
    )

  }

  // ===== SIGNAL DETECTION =====
  try {

    const signals =
      await detectEnterpriseSignals({

        event,

        payload,

      })

    for (const signal of signals) {

      console.log(
        '[SIGNAL_DETECTED]',
        signal.signal
      )

      await emitEvent(

        signal.signal,

        signal.payload

      )

    }

  } catch (error) {

    console.error(
      '[SIGNAL_RUNTIME_ERROR]',
      error
    )

  }

  try {

    await broadcastEvent({

      channel:
        'enterprise-runtime',

      event,

      payload: {

        event,

        payload,

        aiResult,

        timestamp:
          new Date().toISOString(),

      },

    })

  } catch (error) {

    console.error(
      '[REALTIME_BROADCAST_FAILED]',
      error
    )

  }

  return {

    success: true,

    event,

    aiResult,

    handlers:
      handlerResults,

    workflows:
      workflowResults,

  }
}
