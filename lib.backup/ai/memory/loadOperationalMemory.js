import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
loadOperationalMemory({

  tenantId,

  category,

  limit = 50,

}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'operational_memory'
    )
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'category',
      category
    )
    .order(
      'created_at',
      {
        ascending: false,
      }
    )
    .limit(limit)

  if (error) {

    console.error(
      '[MEMORY_LOAD_ERROR]',
      error
    )

    return []

  }

  return data || []

}
