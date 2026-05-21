import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
createApprovalTask({

  tenantId,

  type,

  referenceId,

  payload,

}) {

  console.log(
    '[APPROVAL_RUNTIME]',
    type
  )

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'approval_tasks'
    )
    .insert({

      tenant_id:
        tenantId,

      type,

      reference_id:
        referenceId,

      status:
        'PENDING',

      payload,

    })
    .select()
    .single()

  if (error) {

    console.error(
      '[APPROVAL_TASK_ERROR]',
      error
    )

    return null
  }

  return data

}
