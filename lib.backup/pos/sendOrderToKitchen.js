import { supabase } from '@/lib/shared/supabase/client'

export async function sendOrderToKitchen({
  tenantId,
  orderId,
  sentBy = 'SYSTEM',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!orderId) {
    throw new Error('orderId required')
  }

  const {
    data: order,
    error: orderError,
  } = await supabase
    .from('orders')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      orderId
    )
    .single()

  if (
    orderError ||
    !order
  ) {

    throw new Error(
      'Order not found'
    )
  }

  if (
    order.status === 'VOIDED'
  ) {

    throw new Error(
      'Cannot send voided order'
    )
  }

  const {
    data: kitchenTicket,
    error: kitchenError,
  } = await supabase
    .from('kitchen_tickets')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'order_id',
      orderId
    )
    .single()

  if (
    kitchenError ||
    !kitchenTicket
  ) {

    throw new Error(
      'Kitchen ticket not found'
    )
  }

  if (
    kitchenTicket.status !==
    'PENDING'
  ) {

    throw new Error(
      'Kitchen ticket already processed'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Load Order Items
  |--------------------------------------------------------------------------
  */

  const {
    data: orderItems,
    error: itemError,
  } = await supabase
    .from('order_items')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'order_id',
      orderId
    )

  if (itemError) {
    throw new Error(
      itemError.message
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Mark Kitchen Ticket Sent
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_tickets')
    .update({

      status:
        'SENT',

      sent_at:
        new Date().toISOString(),

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      kitchenTicket.id
    )

  /*
  |--------------------------------------------------------------------------
  | Update Order
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('orders')
    .update({

      kitchen_status:
        'SENT',

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      orderId
    )

  /*
  |--------------------------------------------------------------------------
  | Create Kitchen Queue Items
  |--------------------------------------------------------------------------
  */

  for (const item of orderItems || []) {

    await supabase
      .from('kitchen_queue')
      .insert({

        tenant_id:
          tenantId,

        kitchen_ticket_id:
          kitchenTicket.id,

        order_id:
          orderId,

        order_item_id:
          item.id,

        table_number:
          order.table_number,

        dish_name:
          item.dish_name,

        quantity:
          item.quantity,

        status:
          'WAITING',

        created_at:
          new Date().toISOString(),

      })
  }

  /*
  |--------------------------------------------------------------------------
  | Audit
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('audit_logs')
    .insert({

      tenant_id:
        tenantId,

      module:
        'kitchen',

      action:
        'SEND_TO_KITCHEN',

      reference_id:
        orderId,

      metadata: {

        kitchen_ticket_id:
          kitchenTicket.id,

        table_number:
          order.table_number,

        items:
          orderItems?.length || 0,

        sent_by:
          sentBy,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    orderId,

    kitchenTicketId:
      kitchenTicket.id,

    items:
      orderItems?.length || 0,

    status:
      'SENT',

  }
}
