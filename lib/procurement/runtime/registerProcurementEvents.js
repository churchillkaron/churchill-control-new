import {
  registerEvent,
} from '@/lib/shared/events/eventBus'

import {
  createApprovalTask,
} from '@/lib/approval/runtime/createApprovalTask'

registerEvent(

  'PURCHASE_REQUEST_CREATED',

  async payload => {

    console.log(
      '[PROCUREMENT_EVENT]',
      'PURCHASE_REQUEST_CREATED'
    )

    return {

      success: true,

      request:
        payload.purchaseRequest,

    }

  }

)

registerEvent(

  'MANAGER_APPROVAL_REQUIRED',

  async payload => {

    console.log(
      '[PROCUREMENT_EVENT]',
      'MANAGER_APPROVAL_REQUIRED'
    )

    const approval =
      await createApprovalTask({

        tenantId:
          payload.tenantId,

        type:
          'PURCHASE_REQUEST',

        referenceId:
          payload.purchaseRequest?.id,

        payload,

      })

    return {

      success: true,

      approvalRequired:
        true,

      approval,

    }

  }

)

registerEvent(

  'PROCUREMENT_ALERT',

  async payload => {

    console.log(
      '[PROCUREMENT_EVENT]',
      'PROCUREMENT_ALERT'
    )

    return {

      success: true,

      alertSent:
        true,

    }

  }

)
