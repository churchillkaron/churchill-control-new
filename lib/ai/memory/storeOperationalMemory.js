import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
storeOperationalMemory({

  tenantId,

  category,

  event,

  payload,

  outcome,

}) {

  console.log(
    '[MEMORY_RUNTIME]',
    category
  )

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'operational_memory'
    )
    .insert({

      tenant_id:
        tenantId,

      category,

      event,

      payload,

      outcome,

      created_at:
        new Date()
          .toISOString(),

    })
    .select()
    .single()

  if (error) {

    console.error(
      '[MEMORY_STORE_ERROR]',
      error
    )

    return null

  }

  return data

}
