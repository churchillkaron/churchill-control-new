import { supabase } from '@/lib/shared/supabase/client'

export async function deleteKitchenTicket({
  tenantId,
  kitchenTicketId,
  deletedBy = 'ADMIN',
  reason = 'Delete kitchen ticket',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!kitchenTicketId) {
    throw new Error('kitchenTicketId required')
  }

  const {
    data: ticket,
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
    !ticket
  ) {

    throw new Error(
      'Kitchen ticket not found'
    )
  }

  if (
    !ticket.archived
  ) {

    throw new Error(
      'Kitchen ticket must be archived before deletion'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Delete Kitchen Queue
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .delete()
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'kitchen_ticket_id',
      kitchenTicketId
    )

  /*
  |--------------------------------------------------------------------------
  | Delete Kitchen Ticket
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_tickets')
    .delete()
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      kitchenTicketId
    )

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
        'DELETE_KITCHEN_TICKET',

      reference_id:
        kitchenTicketId,

      metadata: {

        order_id:
          ticket.order_id,

        table_number:
          ticket.table_number,

        deleted_by:
          deletedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenTicketId,

    deleted:
      true,

  }
}
