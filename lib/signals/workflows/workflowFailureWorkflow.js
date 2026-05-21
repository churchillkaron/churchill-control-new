import {
  registerWorkflow,
} from '@/lib/workflows/workflowRegistry'

import {
  createWorkflowIncident,
} from '@/lib/incidents/runtime/createWorkflowIncident'

import {
  attemptWorkflowRecovery,
} from '@/lib/ai/healing/attemptWorkflowRecovery'

export async function
workflowFailureWorkflow(
  payload
) {

  console.log(
    '[WORKFLOW_FAILURE_WORKFLOW]'
  )

  const incident =
    await createWorkflowIncident({

      tenantId:
        payload.tenantId,

      event:
        payload.event,

      workflow:
        payload.workflow,

      error:
        payload.error,

      payload,

    })

  // ===== AI RECOVERY =====

  const recovery =
    await attemptWorkflowRecovery({

      workflow:
        payload.workflow,

      payload,

    })

  return {

    escalation:
      true,

    incident,

    recovery,

    recommendation:
      'Incident created and recovery attempted',

  }

}

registerWorkflow(

  'WORKFLOW_FAILED',

  workflowFailureWorkflow

)
