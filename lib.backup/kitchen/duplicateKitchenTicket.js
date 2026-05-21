import { supabase } from '@/lib/shared/supabase/client'

export async function duplicateKitchenTicket({
  tenantId,
  kitchenTicketId,
  duplicatedBy = 'MANAGER',
  reason = 'Duplicate kitchen ticket',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!kitchenTicketId) {
    throw new Error('kitchenTicketId required')
  }

  const {
    data: originalTicket,
    error: ticketError,
  } = await supabase
    .from('kitchen_tickets')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      kitchenTicketId
    )
    .single()

  if (
    ticketError ||
    !originalTicket
  ) {

    throw new Error(
      'Kitchen ticket not found'
    )
  }

  const {
    data: queueItems,
    error: queueError,
  } = await supabase
    .from('kitchen_queue')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'kitchen_ticket_id',
      kitchenTicketId
    )

  if (queueError) {
    throw new Error(
      queueError.message
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Create Duplicate Ticket
  |--------------------------------------------------------------------------
  */

  const {
    data: duplicatedTicket,
    error: duplicateError,
  } = await supabase
    .from('kitchen_tickets')
    .insert({

      tenant_id:
        tenantId,

      order_id:
        originalTicket.order_id,

      table_number:
        originalTicket.table_number,

      status:
        'WAITING',

      duplicated_from_ticket_id:
        kitchenTicketId,

      duplicated_by:
        duplicatedBy,

      duplicate_reason:
        reason,

      created_at:
        new Date().toISOString(),

      updated_at:
        new Date().toISOString(),

    })
    .select()
    .single()

  if (duplicateError) {
    throw new Error(
      duplicateError.message
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Duplicate Queue Items
  |--------------------------------------------------------------------------
  */

  for (
    const item of
    queueItems || []
  ) {

    await supabase
      .from('kitchen_queue')
      .insert({

        tenant_id:
          tenantId,

        kitchen_ticket_id:
          duplicatedTicket.id,

        order_id:
          item.order_id,

        order_item_id:
          item.order_item_id,

        table_number:
          item.table_number,

        dish_name:
          item.dish_name,

        quantity:
          item.quantity,

        priority:
          item.priority || 'NORMAL',

        course:
          item.course,

        status:
          'WAITING',

        duplicated_from_queue_id:
          item.id,

        created_at:
          new Date().toISOString(),

        updated_at:
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
        'DUPLICATE_KITCHEN_TICKET',

      reference_id:
        duplicatedTicket.id,

      metadata: {

        original_ticket_id:
          kitchenTicketId,

        duplicated_ticket_id:
          duplicatedTicket.id,

        order_id:
          originalTicket.order_id,

        table_number:
          originalTicket.table_number,

        duplicated_by:
          duplicatedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    originalKitchenTicketId:
      kitchenTicketId,

    duplicatedKitchenTicketId:
      duplicatedTicket.id,

    duplicatedItems:
      queueItems?.length || 0,

  }
}
