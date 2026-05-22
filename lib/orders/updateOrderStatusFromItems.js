import { supabase }
from '@/lib/shared/supabase/client'

export async function updateOrderStatusFromItems(
  orderId
) {

  if (!orderId) {
    return
  }

  const {
    data: items,
    error,
  } = await supabase

    .from('order_items')

    .select('*')

    .eq(
      'order_id',
      orderId
    )

  if (error) {
    throw error
  }

  const statuses =
    (items || []).map(
      item => item.status
    )

  let nextStatus =
    'OPEN'

  /*
  |--------------------------------------------------------------------------
  | ALL READY
  |--------------------------------------------------------------------------
  */

  if (

    statuses.length > 0 &&

    statuses.every(
      status =>

        status === 'READY' ||

        status === 'SERVED' ||

        status === 'CLOSED'
    )

  ) {

    nextStatus =
      'READY'
  }

  /*
  |--------------------------------------------------------------------------
  | ALL SERVED
  |--------------------------------------------------------------------------
  */

  if (

    statuses.length > 0 &&

    statuses.every(
      status =>

        status === 'SERVED' ||

        status === 'CLOSED'
    )

  ) {

    nextStatus =
      'BILLING'
  }

  /*
  |--------------------------------------------------------------------------
  | ALL CLOSED
  |--------------------------------------------------------------------------
  */

  if (

    statuses.length > 0 &&

    statuses.every(
      status =>
        status === 'CLOSED'
    )

  ) {

    nextStatus =
      'CLOSED'
  }

  await supabase

    .from('orders')

    .update({

      status:
        nextStatus,

    })

    .eq(
      'id',
      orderId
    )

}
