import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function createKitchenTransfer({
  organization_id,
  organizationId,
  entity_id = null,
  entityId = null,
  item_id,
  quantity,
  from_location,
  to_location,
  transferred_by,
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
      'production_kitchen_transfers'
    )
    .insert([
      {
        organization_id:
          resolvedOrganizationId,
        entity_id:
          resolvedEntityId,
        item_id,
        quantity,
        from_location,
        to_location,
        transferred_by,
        status:
          'COMPLETED',
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  await supabaseAdmin
    .from(
      'inventory_movements'
    )
    .insert([
      {
        organization_id:
          resolvedOrganizationId,

        entity_id:
          resolvedEntityId,

        item_id,

        movement_type:
          'FULFILLMENT_TRANSFER',

        quantity,

        reference_type:
          'CENTRAL_FULFILLMENT',

        reference_id:
          data.id,
      },
    ])

  return data
}
