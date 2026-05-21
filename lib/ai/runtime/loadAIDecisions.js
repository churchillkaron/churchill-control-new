import { supabase }
from '@/lib/shared/supabase/client'

export async function
loadAIDecisions(
  tenantId
) {

  const {
    data,
    error,
  } = await supabase
    .from(
      'ai_decisions'
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
      '[AI_DECISION_LOAD_ERROR]',
      error
    )

    return []
  }

  return data || []
}
