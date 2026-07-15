import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function startProductionSession({
  organization_id,
  organizationId,
  entity_id = null,
  entityId = null,
  station,
  started_by,
}) {
  const resolvedOrganizationId =
    organization_id || organizationId

  const resolvedEntityId =
    entity_id || entityId || null


  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'production_sessions'
    )
    .insert([
      {
        organization_id:
          resolvedOrganizationId,
        entity_id:
          resolvedEntityId,
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
