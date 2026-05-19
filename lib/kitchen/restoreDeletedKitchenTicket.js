import { supabase } from '@/lib/shared/supabase/client'

export async function restoreDeletedKitchenTicket({
  tenantId,
  deletedTicketBackup,
  restoredBy = 'ADMIN',
  reason = 'Restore deleted kitchen ticket',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!deletedTicketBackup) {
    throw new Error('deletedTicketBackup required')
  }

  /*
  |--------------------------------------------------------------------------
  | Restore Kitchen Ticket
  |--------------------------------------------------------------------------
  */

  const {
    data: restoredTicket,
    error: ticketError,
  } = await supabase
    .from('kitchen_tickets')
    .insert({

      ...deletedTicketBackup.ticket,

      archived:
        false,

      restored_by:
        restoredBy,

      restore_reason:
        reason,

      restored_at:
        new Date().toISOString(),

      updated_at:
        new Date().toISOString(),

    })
    .select()
    .single()

  if (ticketError) {
    throw new Error(
      ticketError.message
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Restore Kitchen Queue
  |--------------------------------------------------------------------------
  */

  for (
    const queueItem of
    deletedTicketBackup.queueItems || []
  ) {

    await supabase
      .from('kitchen_queue')
      .insert({

        ...queueItem,

        archived:
          false,

        restored_by:
          restoredBy,

        restored_at:
          new Date().toISOString(),

        updated_at:
          new Date().toISOString(),

      })
  }

  /*
  |--------------------------------------------------------------------------
  | Restore Order State
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('orders')
    .update({

      kitchen_status:
        restoredTicket.status,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      restoredTicket.order_id
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
        'RESTORE_DELETED_KITCHEN_TICKET',

      reference_id:
        restoredTicket.id,

      metadata: {

        order_id:
          restoredTicket.order_id,

        table_number:
          restoredTicket.table_number,

        restored_by:
          restoredBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenTicketId:
      restoredTicket.id,

    restored:
      true,

  }
}
