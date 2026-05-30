import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
createRuntimeSnapshot({

  tenantId,

}) {

  console.log(
    '[SNAPSHOT_RUNTIME]'
  )

  const [
    workflows,
    ai,
    approvals,
    incidents,
    ledger,
  ] = await Promise.all([

    supabaseAdmin
      .from(
        'workflow_logs'
      )
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      )
      .limit(100),

    supabaseAdmin
      .from(
        'ai_decisions'
      )
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      )
      .limit(100),

    supabaseAdmin
      .from(
        'approval_tasks'
      )
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      ),

    supabaseAdmin
      .from(
        'incidents'
      )
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      ),

    supabaseAdmin
      .from(
        'general_ledger'
      )
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      ),

  ])

  const snapshot = {

    workflows:
      workflows.data || [],

    ai:
      ai.data || [],

    approvals:
      approvals.data || [],

    incidents:
      incidents.data || [],

    ledger:
      ledger.data || [],

    created_at:
      new Date().toISOString(),

  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'runtime_snapshots'
    )
    .insert({

      tenant_id:
        tenantId,

      snapshot,

    })
    .select()
    .single()

  if (error) {

    console.error(
      '[SNAPSHOT_ERROR]',
      error
    )

    return null

  }

  return data

}
