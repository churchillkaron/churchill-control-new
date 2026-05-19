import {
  EVENTS,
} from '@/lib/shared/events/events'

import {
  registerEvent,
} from '@/lib/shared/events/eventBus'

import {
  inventoryHandler,
} from './handlers/inventoryHandler'

import {
  financeHandler,
} from './handlers/financeHandler'

import {
  kpiHandler,
} from './handlers/kpiHandler'

import {
  intelligenceHandler,
} from './handlers/intelligenceHandler'

registerEvent(
  EVENTS.ORDER_COMPLETED,

  async payload => {

    console.log(
      'ORDER_COMPLETED workflow triggered',
      payload
    )

    const results =
      await Promise.all([

        inventoryHandler(
          payload
        ),

        financeHandler(
          payload
        ),

        kpiHandler(
          payload
        ),

        intelligenceHandler(
          payload
        ),

      ])

    return {
      success: true,
      modules: results,
    }
  }
)
