import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function createPrepBatch({
  organization_id,
  organizationId,
  entity_id = null,
  entityId = null,
  item_id,
  quantity,
  prepared_by,
  expires_at,
}) {
  const resolvedOrganizationId =
    organization_id || organizationId

  const resolvedEntityId =
    entity_id || entityId || null


  const {
    data,
    error,
  } = await supabaseAdmin
    .from('production_prep_batches')
    .insert([
      {
        organization_id:
          resolvedOrganizationId,
        entity_id:
          resolvedEntityId,
        item_id,
        quantity,
        remaining_quantity:
          quantity,
        prepared_by,
        expires_at,
        status:
          'ACTIVE',
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
