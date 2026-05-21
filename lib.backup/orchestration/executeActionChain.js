import {
  emitEvent,
} from '@/lib/shared/events/eventBus'

export async function
executeActionChain({

  actions = [],

}) {

  const results = []

  for (const action of actions) {

    try {

      console.log(
        '[ACTION_CHAIN]',
        action.event
      )

      const result =
        await emitEvent(

          action.event,

          action.payload || {}

        )

      results.push({

        success: true,

        event:
          action.event,

        result,

      })

    } catch (error) {

      console.error(
        '[ACTION_CHAIN_ERROR]',
        error
      )

      results.push({

        success: false,

        event:
          action.event,

        error:
          error.message,

      })

    }
  }

  return results

}
