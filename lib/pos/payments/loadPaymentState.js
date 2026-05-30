import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

import {
  getActiveTableSession,
} from '@/lib/restaurant/services/getActiveTableSession'

import calculateOrderTotals
from '@/lib/pos/orders/calculateOrderTotals'

export async function loadPaymentState({
  tenantId,
  tableNumber,
}) {

  const session =
    await getActiveTableSession({
      tenantId,
      tableNumber,
    })

  if (!session) {
    return null
  }

  const {
    data: orders,
  } = await supabaseAdmin

    .from('orders')

    .select(`
      *,
      order_items (*)
    `)

    .eq(
      'tenant_id',
      tenantId
    )

    .eq(
      'session_id',
      session.id
    )

    .in(
      'status',
      [
        'OPEN',
        'ACTIVE',
        'READY_FOR_PAYMENT',
        'PARTIAL',
      ]
    )

  const activeOrders =
    orders || []

  const items =
    activeOrders.flatMap(
      order =>
        order.order_items || []
    )

  const totals =
    calculateOrderTotals({

      items,

      taxRate: 7,

      serviceChargeRate: 5,

    })

  const {
    data: payments,
  } = await supabaseAdmin

    .from(
      'payment_transactions'
    )

    .select('*')

    .eq(
      'tenant_id',
      tenantId
    )

    .eq(
      'table_session_id',
      session.id
    )

  const paidAmount =
    Number(
      (
        (payments || [])

          .reduce(
            (
              sum,
              payment
            ) =>

              sum +

              Number(
                payment.paid_amount || 0
              ),

            0
          )
      ).toFixed(2)
    )

  const remainingBalance =
    Math.max(
      0,
      Number(
        (
          totals.total -
          paidAmount
        ).toFixed(2)
      )
    )

  return {

    session,

    activeOrders,

    items,

    payments:
      payments || [],

    subtotal:
      totals.subtotal,

    tax:
      totals.tax,

    serviceCharge:
      totals.service_charge,

    grandTotal:
      totals.total,

    paidAmount,

    remainingBalance,

  }

}
