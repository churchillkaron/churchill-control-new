import { supabase } from '@/lib/shared/supabase/client'

export async function archiveKitchenTicket({
  tenantId,
  kitchenTicketId,
  archivedBy = 'MANAGER',
  reason = 'Archive kitchen ticket',
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
    ![
      'SERVED',
      'BUMPED',
      'COMPLETED',
      'VOIDED',
    ].includes(
      ticket.status
    )
  ) {

    throw new Error(
      'Only finalized tickets can be archived'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Archive Kitchen Queue
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      archived:
        true,

      archived_by:
        archivedBy,

      archive_reason:
        reason,

      archived_at:
        new Date().toISOString(),

      updated_at:
        new Date().toISOString(),

    })
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
  | Archive Kitchen Ticket
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_tickets')
    .update({

      archived:
        true,

      archived_by:
        archivedBy,

      archive_reason:
        reason,

      archived_at:
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
        'ARCHIVE_KITCHEN_TICKET',

      reference_id:
        kitchenTicketId,

      metadata: {

        order_id:
          ticket.order_id,

        table_number:
          ticket.table_number,

        archived_by:
          archivedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenTicketId,

    archived:
      true,

  }
}
