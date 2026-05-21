import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
createRuntimeJob({

  tenantId,

  type,

  payload,

}) {

  console.log(
    '[QUEUE_RUNTIME]',
    type
  )

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'runtime_jobs'
    )
    .insert({

      tenant_id:
        tenantId,

      type,

      status:
        'PENDING',

      payload,

    })
    .select()
    .single()

  if (error) {

    console.error(
      '[RUNTIME_JOB_ERROR]',
      error
    )

    return null
  }

  return data

}
