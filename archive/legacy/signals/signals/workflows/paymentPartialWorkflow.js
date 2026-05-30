import {
  registerWorkflow,
} from '@/lib/workflows/workflowRegistry'


export async function
paymentPartialWorkflow(
  payload
) {

  console.log(
    '[PAYMENT_PARTIAL_WORKFLOW]'
  )

  return {

    success: true,

    workflow:
      'PAYMENT_PARTIAL',

  }

}

registerWorkflow(

  'PAYMENT_PARTIAL',

  paymentPartialWorkflow

)
