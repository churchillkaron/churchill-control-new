import { supabase }
from '@/lib/shared/supabase/client'

export async function
loadApprovalTasks(
  tenantId
) {

  const {
    data,
    error,
  } = await supabase
    .from(
      'approval_tasks'
    )
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .order(
      'created_at',
      {
        ascending: false,
      }
    )
    .limit(50)

  if (error) {

    console.error(
      '[APPROVAL_LOAD_ERROR]',
      error
    )

    return []
  }

  return data || []

}
