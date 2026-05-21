import {
  EVENTS,
} from '@/lib/shared/events/events'

import {
  registerWorkflow,
} from '@/lib/workflows/workflowRegistry'

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

registerWorkflow(

  EVENTS.ORDER_COMPLETED,

  async payload => {

    console.log(
      '[WORKFLOW]',
      EVENTS.ORDER_COMPLETED
    )

    const inventory =
      await inventoryHandler(
        payload
      )

    const finance =
      await financeHandler({

        ...payload,

        inventory,

      })

    const kpi =
      await kpiHandler({

        ...payload,

        inventory,

        finance,

      })

    const intelligence =
      await intelligenceHandler({

        ...payload,

        inventory,

        finance,

        kpi,

      })

    return {

      success: true,

      orderId:
        payload.orderId,

      tenantId:
        payload.tenantId,

      modules: {

        inventory,

        finance,

        kpi,

        intelligence,

      },

    }

  }
)
