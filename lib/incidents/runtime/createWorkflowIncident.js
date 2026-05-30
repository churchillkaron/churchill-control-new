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
      'enterprise_security_incidents'
    )
    .insert({

      tenant_id:
        tenantId,

      incident_type:
        'WORKFLOW_FAILURE',

      incident_category:
        'RUNTIME_ORCHESTRATION',

      severity:
        'HIGH',

      incident_status:
        'OPEN',

      source_system:
        'WORKFLOW_RUNTIME',

      reference_table:
        'workflow_logs',

      detected_by:
        workflow,

      incident_summary:
        `Workflow failure: ${workflow}`,

      incident_details: {

        event,

        workflow,

        error,

        payload,

      },

      created_at:
        new Date().toISOString(),

      updated_at:
        new Date().toISOString(),

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
