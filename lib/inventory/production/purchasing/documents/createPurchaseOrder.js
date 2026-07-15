import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function createPurchaseOrder({
  organization_id,
  organizationId,
  entity_id = null,
  entityId = null,
  supplier_name,
  items = [],
  created_by,
}) {
  const resolvedOrganizationId =
    organization_id || organizationId

  const resolvedEntityId =
    entity_id || entityId || null


  const total =
    items.reduce(
      (
        sum,
        item
      ) =>
        sum +
        (
          Number(
            item.quantity || 0
          ) *
          Number(
            item.unit_price || 0
          )
        ),
      0
    )

  const {
    data: po,
    error: poError,
  } = await supabaseAdmin
    .from(
      'production_purchase_orders'
    )
    .insert([
      {
        organization_id:
          resolvedOrganizationId,
        entity_id:
          resolvedEntityId,
        supplier_name,
        total,
        created_by,
        status:
          'PENDING',
      },
    ])
    .select()
    .single()

  if (poError) {
    throw poError
  }

  const rows =
    items.map(
      item => ({
        organization_id:
          resolvedOrganizationId,

        entity_id:
          resolvedEntityId,

        purchase_order_id:
          po.id,

        item_id:
          item.item_id,

        quantity:
          item.quantity,

        unit_price:
          item.unit_price,
      })
    )

  const {
    error: itemError,
  } = await supabaseAdmin
    .from(
      'production_purchase_order_items'
    )
    .insert(rows)

  if (itemError) {
    throw itemError
  }

  return po
}
