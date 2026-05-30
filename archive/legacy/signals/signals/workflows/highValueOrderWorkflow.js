import {
  registerWorkflow,
} from '@/lib/workflows/workflowRegistry'

import {
  createVIPCustomerEvent,
} from '@/lib/customer/runtime/createVIPCustomerEvent'

export async function
highValueOrderWorkflow(
  payload
) {

  console.log(
    '[HIGH_VALUE_ORDER_WORKFLOW]'
  )

  const vipEvent =
    await createVIPCustomerEvent({

      tenantId:
        payload.tenantId,

      customerId:
        payload.customerId,

      orderId:
        payload.orderId,

      total:
        payload.total,

    })

  return {

    vipCustomer:
      true,

    vipEvent,

    recommendation:
      'VIP retention workflow activated',

  }

}

registerWorkflow(

  'HIGH_VALUE_ORDER',

  highValueOrderWorkflow

)
