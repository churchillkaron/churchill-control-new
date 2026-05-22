import {
  createServerSupabase,
} from '@/lib/shared/supabase/server'

import {
  getActiveTableSession,
} from '@/lib/restaurant/services/getActiveTableSession'


const supabase =
  createServerSupabase()


export async function partialPayment({
  tenantId,
  tableNumber,
  paymentMethod = 'CASH',
  amount = 0,
  cashierName = 'SYSTEM',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!tableNumber) {
    throw new Error('tableNumber required')
  }

  if (Number(amount) <= 0) {
    throw new Error('Invalid payment amount')
  }

  const posSettings =
    await loadOperationalSettings({

      tenantId,

      domain:
        'POS',

    })

  if (
    !posSettings?.allow_partial_payment
  ) {

    throw new Error(
      'Partial payment disabled by POS settings'
    )

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
    .gte(
      'created_at',
      session.started_at
    )

  if (orderError) {
    throw new Error(orderError.message)
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
    posSettings?.enable_service_charge

      ? Number(
          (
            subtotal *
            (
              Number(
                posSettings?.service_charge_percent || 0
              ) / 100
            )
          ).toFixed(2)
        )

      : 0

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

  const alreadyPaid =
    Number(
      session.paid_amount || 0
    )

  const newPaidAmount =
    Number(
      (
        alreadyPaid +
        Number(amount)
      ).toFixed(2)
    )

  const remainingBalance =
    Number(
      (
        finalTotal -
        newPaidAmount
      ).toFixed(2)
    )

  if (newPaidAmount > finalTotal) {
    throw new Error(
      'Payment exceeds balance'
    )
  }

  await supabase
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

      subtotal:
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
        amount,

      change_amount:
        0,

      cashier_name:
        cashierName,

      status:
        remainingBalance <= 0
          ? 'PAID'
          : 'PARTIAL',

      notes:
        'PARTIAL_PAYMENT',

      created_at:
        new Date().toISOString(),

    })

  const paymentStatus =
    remainingBalance <= 0
      ? 'PAID'
      : 'PARTIAL'

  await supabase
    .from('orders')
    .update({

      payment_status:
        paymentStatus,

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

  await supabase
    .from('table_sessions')
    .update({

      status:
        remainingBalance <= 0
          ? 'CLOSED'
          : 'READY_FOR_PAYMENT',

      paid_amount:
        newPaidAmount,

      final_total:
        finalTotal,

      updated_at:
        new Date().toISOString(),

      ...(remainingBalance <= 0 && {

        closed_at:
          new Date().toISOString(),

      }),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      session.id
    )

  if (remainingBalance <= 0) {

    await supabase
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
  }

  await supabase
    .from('audit_logs')
    .insert({

      tenant_id:
        tenantId,

      module:
        'pos',

      action:
        'PARTIAL_PAYMENT',

      reference_id:
        session.id,

      metadata: {

        table_number:
          tableNumber,

        amount,

        already_paid:
          alreadyPaid,

        new_paid_amount:
          newPaidAmount,

        remaining_balance:
          remainingBalance,

      },

      created_at:
        new Date().toISOString(),

    })

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
      newPaidAmount,

    remainingBalance,

    paymentStatus,

  }
}
