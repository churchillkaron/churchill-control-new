import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
createWorkflowIncident({

  tenantId,

  event,

  workflow,

  error,

  payload,

}) {

  console.log(
    '[INCIDENT_RUNTIME]',
    workflow
  )

  const {
    data,
    error: insertError,
  } = await supabaseAdmin
    .from(
      'incidents'
    )
    .insert({

      tenant_id:
        tenantId,

      source:
        'WORKFLOW_RUNTIME',

      event,

      workflow,

      severity:
        'HIGH',

      status:
        'OPEN',

      message:
        error || 'Workflow failed',

      payload,

    })
    .select()
    .single()

  if (insertError) {

    console.error(
      '[INCIDENT_CREATE_ERROR]',
      insertError
    )

    return null
  }

  return data

}
