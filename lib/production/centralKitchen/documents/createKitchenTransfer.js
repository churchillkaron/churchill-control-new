import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function createKitchenTransfer({
  tenant_id,
  item_id,
  quantity,
  from_location,
  to_location,
  transferred_by,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'production_kitchen_transfers'
    )
    .insert([
      {
        tenant_id,
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
