import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function createPurchaseOrder({
  tenant_id,
  supplier_name,
  items = [],
  created_by,
}) {

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
        tenant_id,
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
        purchase_order_id:
          po.id,

        ingredient_id:
          item.ingredient_id,

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
