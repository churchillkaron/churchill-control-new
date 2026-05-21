import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
processEnterpriseEvent({

  event,

  payload,

}) {

  console.log(
    '[AI_RUNTIME]',
    event
  )

  let decision = {

    aiAction:
      'NO_ACTION',

  }

  switch (event) {

    case 'ORDER_COMPLETED':

      decision = {

        aiAction:
          'REVENUE_UPDATED',

        recommendation:
          'Monitor sales velocity',

      }

      break

    case 'LOW_INVENTORY':

      decision = {

        aiAction:
          'PROCUREMENT_RECOMMENDED',

        recommendation:
          'Generate purchase request',

      }

      break

    case 'WORKFLOW_FAILED':

      decision = {

        aiAction:
          'ALERT_MANAGER',

        recommendation:
          'Investigate workflow failure',

      }

      break

  }

  try {

    await supabaseAdmin
      .from(
        'ai_decisions'
      )
      .insert({

        tenant_id:
          payload.tenantId,

        event,

        ai_action:
          decision.aiAction,

        recommendation:
          decision.recommendation,

        payload,

      })

  } catch (error) {

    console.error(
      '[AI_DECISION_LOG_ERROR]',
      error
    )

  }

  return decision

}
