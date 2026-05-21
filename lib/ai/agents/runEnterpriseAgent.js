import {
  loadOperationalMemory,
} from '@/lib/ai/memory/loadOperationalMemory'

import {
  createRuntimeJob,
} from '@/lib/runtime/queue/createRuntimeJob'

export async function
runEnterpriseAgent({

  tenantId,

  agent,

}) {

  console.log(
    '[ENTERPRISE_AGENT]',
    agent
  )

  const memory =
    await loadOperationalMemory({

      tenantId,

      category:
        agent,

      limit:
        100,

    })

  // ===== PROCUREMENT AGENT =====

  if (
    agent ===
    'PROCUREMENT_AGENT'
  ) {

    const lowInventoryEvents =
      memory.filter(

        row =>
          row.event ===
          'LOW_INVENTORY'

      )

    if (
      lowInventoryEvents.length >= 3
    ) {

      await createRuntimeJob({

        tenantId,

        type:
          'PROCUREMENT_OPTIMIZATION',

        payload: {

          recommendation:
            'Increase recurring inventory ordering',

          basedOn:
            lowInventoryEvents.length,

        },

      })

    }

  }

  // ===== FINANCE AGENT =====

  if (
    agent ===
    'FINANCE_AGENT'
  ) {

    const lossEvents =
      memory.filter(

        row =>
          row.outcome ===
          'LOSS'

      )

    if (
      lossEvents.length >= 5
    ) {

      await createRuntimeJob({

        tenantId,

        type:
          'FINANCIAL_RISK_REVIEW',

        payload: {

          severity:
            'HIGH',

        },

      })

    }

  }

  return {

    success: true,

    agent,

    analyzed:
      memory.length,

  }

}
