import { supabase } from '@/lib/shared/supabase/client'

import {
  getActiveTableSession,
} from '@/lib/restaurant/services/getActiveTableSession'

export async function markOrderPaid({
  tenantId,
  tableNumber,
  paymentMethod = 'CASH',
  cashierName = 'SYSTEM',
  paidAmount = null,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!tableNumber) {
    throw new Error('tableNumber required')
  }

  const session =
    await getActiveTableSession({

      tenantId,

      tableNumber,

    })

  if (!session) {
    throw new Error(
      'No active session found'
    )
  }

  const {
    data: unpaidOrders,
    error: orderError,
  } = await supabase
    .from('orders')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'table_number',
      tableNumber
    )
    .neq(
      'payment_status',
      'PAID'
    )

  if (orderError) {
    throw new Error(orderError.message)
  }

  if (
    !unpaidOrders ||
    unpaidOrders.length === 0
  ) {

    throw new Error(
      'No unpaid orders found'
    )
  }

  const subtotal =
    unpaidOrders.reduce(
      (sum, order) =>
        sum +
        Number(
          order.total_amount ||
          order.total ||
          0
        ),
      0
    )

  const serviceCharge =
    Number(
      (
        subtotal * 0.05
      ).toFixed(2)
    )

  const vat =
    Number(
      (
        (
          subtotal +
          serviceCharge
        ) * 0.07
      ).toFixed(2)
    )

  const finalTotal =
    Number(
      (
        subtotal +
        serviceCharge +
        vat
      ).toFixed(2)
    )

  const actualPaid =
    paidAmount !== null
      ? Number(paidAmount)
      : finalTotal

  if (actualPaid < finalTotal) {

    throw new Error(
      'Insufficient payment amount'
    )
  }

  const changeAmount =
    Number(
      (
        actualPaid -
        finalTotal
      ).toFixed(2)
    )

  const {
    error: paymentError,
  } = await supabase
    .from('payment_transactions')
    .insert({

      tenant_id:
        tenantId,

      table_session_id:
        session.id,

      table_number:
        tableNumber,

      payment_method:
        paymentMethod,

      subtotal,

      service_charge_amount:
        serviceCharge,

      vat_amount:
        vat,

      discount_amount:
        0,

      final_total:
        finalTotal,

      paid_amount:
        actualPaid,

      change_amount:
        changeAmount,

      cashier_name:
        cashierName,

      status:
        'PAID',

      created_at:
        new Date().toISOString(),

    })

  if (paymentError) {
    throw new Error(paymentError.message)
  }

  const orderIds =
    unpaidOrders.map(
      order => order.id
    )

  const {
    error: updateOrdersError,
  } = await supabase
    .from('orders')
    .update({

      payment_status:
        'PAID',

      payment_method:
        paymentMethod,

      amount_paid:
        actualPaid,

      change_amount:
        changeAmount,

      paid_at:
        new Date().toISOString(),

      completed_at:
        new Date().toISOString(),

      status:
        'COMPLETED',

    })
    .in(
      'id',
      orderIds
    )

  if (updateOrdersError) {
    throw new Error(
      updateOrdersError.message
    )
  }

  const {
    error: sessionCloseError,
  } = await supabase
    .from('table_sessions')
    .update({

      status:
        'CLOSED',

      payment_method:
        paymentMethod,

      paid_amount:
        actualPaid,

      final_total:
        finalTotal,

      service_charge_amount:
        serviceCharge,

      vat_amount:
        vat,

      paid_at:
        new Date().toISOString(),

      closed_at:
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
      session.id
    )

  if (sessionCloseError) {
    throw new Error(
      sessionCloseError.message
    )
  }

  const {
    error: tableResetError,
  } = await supabase
    .from('restaurant_tables')
    .update({

      status:
        'AVAILABLE',

      active_session_id:
        null,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'table_number',
      tableNumber
    )

  if (tableResetError) {
    throw new Error(
      tableResetError.message
    )
  }

  return {

    success: true,

    tableNumber,

    sessionId:
      session.id,

    subtotal,

    serviceCharge,

    vat,

    finalTotal,

    paidAmount:
      actualPaid,

    changeAmount,

    paidOrders:
      orderIds.length,

  }
}
