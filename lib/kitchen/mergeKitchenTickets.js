import { supabase } from '@/lib/shared/supabase/client'

export async function mergeKitchenTickets({
  tenantId,
  sourceKitchenTicketId,
  targetKitchenTicketId,
  mergedBy = 'MANAGER',
  reason = 'Merge kitchen tickets',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!sourceKitchenTicketId) {
    throw new Error('sourceKitchenTicketId required')
  }

  if (!targetKitchenTicketId) {
    throw new Error('targetKitchenTicketId required')
  }

  if (
    sourceKitchenTicketId ===
    targetKitchenTicketId
  ) {

    throw new Error(
      'Cannot merge same ticket'
    )
  }

  const {
    data: sourceTicket,
    error: sourceError,
  } = await supabase
    .from('kitchen_tickets')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      sourceKitchenTicketId
    )
    .single()

  if (
    sourceError ||
    !sourceTicket
  ) {

    throw new Error(
      'Source kitchen ticket not found'
    )
  }

  const {
    data: targetTicket,
    error: targetError,
  } = await supabase
    .from('kitchen_tickets')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      targetKitchenTicketId
    )
    .single()

  if (
    targetError ||
    !targetTicket
  ) {

    throw new Error(
      'Target kitchen ticket not found'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Move Queue Items
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      kitchen_ticket_id:
        targetKitchenTicketId,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'kitchen_ticket_id',
      sourceKitchenTicketId
    )

  /*
  |--------------------------------------------------------------------------
  | Mark Source Ticket Merged
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_tickets')
    .update({

      status:
        'MERGED',

      merged_into_ticket_id:
        targetKitchenTicketId,

      merged_by:
        mergedBy,

      merge_reason:
        reason,

      merged_at:
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
      sourceKitchenTicketId
    )

  /*
  |--------------------------------------------------------------------------
  | Update Target Ticket
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_tickets')
    .update({

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      targetKitchenTicketId
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
        'MERGE_KITCHEN_TICKETS',

      reference_id:
        targetKitchenTicketId,

      metadata: {

        source_ticket_id:
          sourceKitchenTicketId,

        target_ticket_id:
          targetKitchenTicketId,

        merged_by:
          mergedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    sourceKitchenTicketId,

    targetKitchenTicketId,

    status:
      'MERGED',

  }
}
