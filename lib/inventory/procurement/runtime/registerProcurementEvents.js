import {
  registerEvent,
} from '@/lib/shared/events/eventBus'

import {
  createApprovalRequest,
} from '@/lib/shared/approvals/createApprovalRequest'

registerEvent(

  'PURCHASE_REQUEST_CREATED',

  async payload => {

    if (process.env.NODE_ENV !== "production") console.log(
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

    if (process.env.NODE_ENV !== "production") console.log(
      '[PROCUREMENT_EVENT]',
      'MANAGER_APPROVAL_REQUIRED'
    )

    const approval =
      await createApprovalRequest({

        organizationId:
          payload.purchaseRequest?.organization_id,

        workflowType:
          'PURCHASE_REQUEST',

        referenceTable:
          'purchase_requests',

        referenceId:
          payload.purchaseRequest?.id,

        requestedBy:
          payload.purchaseRequest?.created_by || null,

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

    if (process.env.NODE_ENV !== "production") console.log(
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
