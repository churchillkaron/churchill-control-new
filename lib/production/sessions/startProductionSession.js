import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function startProductionSession({
  tenant_id,
  station,
  started_by,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'production_sessions'
    )
    .insert([
      {
        tenant_id,
        station,
        started_by,
        status:
          'ACTIVE',
        started_at:
          new Date()
            .toISOString(),
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
