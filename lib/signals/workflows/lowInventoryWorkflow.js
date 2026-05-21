import {
  registerWorkflow,
} from '@/lib/workflows/workflowRegistry'

import {
  createPurchaseRequest,
} from '@/lib/procurement/runtime/createPurchaseRequest'

import {
  executeActionChain,
} from '@/lib/orchestration/executeActionChain'

export async function
lowInventoryWorkflow(
  payload
) {

  console.log(
    '[LOW_INVENTORY_WORKFLOW]'
  )

  const request =
    await createPurchaseRequest({

      tenantId:
        payload.tenantId,

      ingredientId:
        payload.inventory
          ?.ingredientId,

      ingredientName:
        payload.inventory
          ?.ingredientName,

      currentStock:
        payload.inventory
          ?.remaining,

    })

  // ===== EXECUTION CHAIN =====
  const chain =
    await executeActionChain({

      actions: [

        {

          event:
            'PURCHASE_REQUEST_CREATED',

          payload: {

            tenantId:
              payload.tenantId,

            purchaseRequest:
              request,

          },

        },

        {

          event:
            'MANAGER_APPROVAL_REQUIRED',

          payload: {

            tenantId:
              payload.tenantId,

            purchaseRequest:
              request,

          },

        },

        {

          event:
            'PROCUREMENT_ALERT',

          payload: {

            tenantId:
              payload.tenantId,

            purchaseRequest:
              request,

          },

        },

      ],

    })

  return {

    procurementRequired:
      true,

    purchaseRequest:
      request,

    chain,

    recommendation:
      'Purchase workflow executed',

  }

}

registerWorkflow(

  'LOW_INVENTORY',

  lowInventoryWorkflow

)
