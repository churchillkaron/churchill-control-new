import { supabase }
from '@/lib/shared/supabase/client'

export async function
loadRealtimeApprovals(
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
    .limit(100)

  if (error) {

    console.error(
      '[REALTIME_APPROVALS_ERROR]',
      error
    )

    return []
  }

  return data || []

}
