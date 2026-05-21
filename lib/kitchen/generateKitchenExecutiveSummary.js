import { supabase }
from '@/lib/shared/supabase/client'

export async function
generateKitchenExecutiveSummary({

  tenant_id,

}) {

  if (!tenant_id) {

    throw new Error(
      'tenant_id required'
    )

  }

  const {
    data: tickets,
    error: ticketError,
  } = await supabase
    .from(
      'kitchen_tickets'
    )
    .select('*')
    .eq(
      'tenant_id',
      tenant_id
    )

  if (ticketError) {

    console.error(
      ticketError
    )

  }

  const {
    data: items,
    error: itemError,
  } = await supabase
    .from(
      'kitchen_ticket_items'
    )
    .select('*')
    .eq(
      'tenant_id',
      tenant_id
    )

  if (itemError) {

    console.error(
      itemError
    )

  }

  const activeTickets =
    (tickets || []).filter(

      ticket =>

        ticket.status !==
        'DONE'

    )

  const completedTickets =
    (tickets || []).filter(

      ticket =>

        ticket.status ===
        'DONE'

    )

  const pendingItems =
    (items || []).filter(

      item =>

        item.status !==
        'DONE'

    )

  const completedItems =
    (items || []).filter(

      item =>

        item.status ===
        'DONE'

    )

  const avgPrepTime =
    completedTickets.length > 0

      ? completedTickets.reduce(

          (
            sum,
            ticket
          ) =>

            sum +
            Number(
              ticket.prep_time || 0
            ),

          0

        ) /
        completedTickets.length

      : 0

  return {

    activeTickets:
      activeTickets.length,

    completedTickets:
      completedTickets.length,

    pendingItems:
      pendingItems.length,

    completedItems:
      completedItems.length,

    averagePrepTime:
      Number(
        avgPrepTime.toFixed(1)
      ),

    kitchenLoad:

      activeTickets.length > 15

        ? 'HIGH'

        : activeTickets.length > 5

          ? 'MEDIUM'

          : 'LOW',

  }

}
