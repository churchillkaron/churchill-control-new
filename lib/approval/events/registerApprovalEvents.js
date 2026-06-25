import {
  registerEvent,
} from '@/lib/shared/events/eventBus'

import {
  createPurchaseOrder,
} from '@/lib/procurement/purchase-orders/createPurchaseOrder'

registerEvent(

  'APPROVAL_GRANTED',

  async payload => {

    console.log(
      '[APPROVAL_GRANTED]',
      payload.type
    )

    let purchaseOrder =
      null

    if (
      payload.type ===
      'PURCHASE_REQUEST'
    ) {

      purchaseOrder =
        await createPurchaseOrder({

          tenantId:
            payload.tenantId,

          approval:
            payload.approval,

        })

    }

    return {

      success: true,

      approved:
        true,

      purchaseOrder,

    }

  }

)

registerEvent(

  'APPROVAL_REJECTED',

  async payload => {

    console.log(
      '[APPROVAL_REJECTED]',
      payload.type
    )

    return {

      success: true,

      rejected:
        true,

    }

  }

)
