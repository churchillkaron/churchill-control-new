import { supabase } from '@/lib/shared/supabase/client'

export async function createOrder({
  tenantId,
  tableNumber,
  staffId = null,
  staffName = 'STAFF',
  items = [],
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!tableNumber) {
    throw new Error('tableNumber required')
  }

  if (!items.length) {
    throw new Error('Order items required')
  }

  const total =
    items.reduce(
      (sum, item) =>
        sum +
        (
          Number(item.price || 0) *
          Number(item.quantity || 1)
        ),
      0
    )

  const cost =
    items.reduce(
      (sum, item) =>
        sum +
        (
          Number(item.cost || 0) *
          Number(item.quantity || 1)
        ),
      0
    )

  const {
    data: order,
    error: orderError,
  } = await supabase
    .from('orders')
    .insert({

      tenant_id:
        tenantId,

      table_number:
        tableNumber,

      staff_id:
        staffId,

      staff_name:
        staffName,

      total,

      total_amount:
        total,

      cost,

      status:
        'OPEN',

      kitchen_status:
        'PENDING',

      production_status:
        'PENDING',

      payment_status:
        'UNPAID',

      started_at:
        new Date().toISOString(),

      created_at:
        new Date().toISOString(),

    })
    .select()
    .single()

  if (orderError) {
    throw new Error(orderError.message)
  }

  const orderItems =
    items.map(item => ({

      tenant_id:
        tenantId,

      order_id:
        order.id,

      dish_id:
        item.dish_id || item.id,

      dish_name:
        item.name,

      quantity:
        Number(item.quantity || 1),

      price:
        Number(item.price || 0),

      cost:
        Number(item.cost || 0),

      total:
        Number(item.price || 0) *
        Number(item.quantity || 1),

      created_at:
        new Date().toISOString(),

    }))

  const {
    error: itemError,
  } = await supabase
    .from('order_items')
    .insert(orderItems)

  if (itemError) {
    throw new Error(itemError.message)
  }

  const {
    error: kitchenError,
  } = await supabase
    .from('kitchen_tickets')
    .insert({

      tenant_id:
        tenantId,

      order_id:
        order.id,

      table_number:
        tableNumber,

      status:
        'PENDING',

      created_at:
        new Date().toISOString(),

    })

  if (kitchenError) {
    throw new Error(kitchenError.message)
  }

  return {

    success: true,

    order,

  }
}
