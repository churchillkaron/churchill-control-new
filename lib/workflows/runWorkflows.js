import {
  getWorkflows,
} from './workflowRegistry'

import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function runWorkflows(
  event,
  payload = {}
) {

  const workflows =
    getWorkflows(event)

  const results = []

  for (const workflow of workflows) {

    const workflowName =
      workflow.name ||
      'anonymous_workflow'

    const startedAt =
      new Date()

    try {

      const result =
        await workflow(payload)

      const completedAt =
        new Date()

      const durationMs =
        completedAt.getTime() -
        startedAt.getTime()

      results.push({

        success: true,

        result,

      })

      try {

        await supabaseAdmin
          .from(
            'workflow_logs'
          )
          .insert({

            tenant_id:
              payload.tenantId,

            event,

            workflow:
              workflowName,

            status:
              'SUCCESS',

            payload,

            result,

            duration_ms:
              durationMs,

            started_at:
              startedAt.toISOString(),

            completed_at:
              completedAt.toISOString(),

          })

      } catch (logError) {

        console.error(
          '[WORKFLOW_LOG_ERROR]',
          logError
        )

      }

    } catch (error) {

      const completedAt =
        new Date()

      const durationMs =
        completedAt.getTime() -
        startedAt.getTime()

      console.error(
        '[WORKFLOW_ERROR]',
        event,
        error
      )

      results.push({

        success: false,

        error:
          error.message,

      })

      try {

        await supabaseAdmin
          .from(
            'workflow_logs'
          )
          .insert({

            tenant_id:
              payload.tenantId,

            event,

            workflow:
              workflowName,

            status:
              'FAILED',

            payload,

            error:
              error.message,

            duration_ms:
              durationMs,

            started_at:
              startedAt.toISOString(),

            completed_at:
              completedAt.toISOString(),

          })

      } catch (logError) {

        console.error(
          '[WORKFLOW_LOG_ERROR]',
          logError
        )

      }

    }
  }

  return results
}
