import { supabase } from '@/lib/shared/supabase/client'

import loadOperationalSettings
from '@/lib/settings/loadOperationalSettings'

import {
  getActiveTableSession,
} from '@/lib/restaurant/services/getActiveTableSession'

export async function splitPayment({
  tenantId,
  tableNumber,
  splits = [],
  cashierName = 'SYSTEM',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!tableNumber) {
    throw new Error('tableNumber required')
  }

  if (!splits.length) {
    throw new Error('Payment splits required')
  }

  const posSettings =
    await loadOperationalSettings({

      tenantId,

      domain:
        'POS',

    })

  if (
    !posSettings?.allow_split_payment
  ) {

    throw new Error(
      'Split payment disabled by POS settings'
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

  const splitTotal =
    splits.reduce(
      (sum, split) =>
        sum +
        Number(split.amount || 0),
      0
    )

  if (
    Number(splitTotal.toFixed(2)) !==
    Number(finalTotal.toFixed(2))
  ) {

    throw new Error(
      'Split total does not match final total'
    )
  }

  for (const split of splits) {

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
          split.paymentMethod,

        subtotal:
          subtotal,

        service_charge_amount:
          serviceCharge,

        vat_amount:
          vat,

        discount_amount:
          0,

        final_total:
          split.amount,

        paid_amount:
          split.amount,

        change_amount:
          0,

        cashier_name:
          cashierName,

        status:
          'PAID',

        notes:
          'SPLIT_PAYMENT',

        created_at:
          new Date().toISOString(),

      })
  }

  const orderIds =
    unpaidOrders.map(
      order => order.id
    )

  await supabase
    .from('orders')
    .update({

      payment_status:
        'PAID',

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

  await supabase
    .from('table_sessions')
    .update({

      status:
        'CLOSED',

      paid_amount:
        finalTotal,

      final_total:
        finalTotal,

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

  await supabase
    .from('audit_logs')
    .insert({

      tenant_id:
        tenantId,

      module:
        'pos',

      action:
        'SPLIT_PAYMENT',

      reference_id:
        session.id,

      metadata: {

        table_number:
          tableNumber,

        splits,

        final_total:
          finalTotal,

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

    splits,

  }
}
