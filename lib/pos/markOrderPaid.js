import {
  supabaseAdmin,
} from '@/lib/shared/supabase/admin'

import loadOperationalSettings
from '@/lib/settings/loadOperationalSettings'

import {
  loadPaymentState,
} from '@/lib/pos/payments/loadPaymentState'

import {
  emitEvent,
} from '@/lib/shared/events/eventBus'

import {
  processCustomerVisit,
} from '@/lib/customer/processCustomerVisit'

import {
  processOrderProduction,
} from '@/lib/production/processOrderProduction'

import {
  recordSystemEvent,
} from '@/lib/events/recordSystemEvent'

import recalculateOrderTotals
from '@/lib/pos/orders/recalculateOrderTotals'

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

  const posSettings =
    await loadOperationalSettings({
      tenantId,
      domain:
        'POS',
    })

  if (
    paymentMethod === 'CASH' &&
    !posSettings?.allow_cash_payment
  ) {
    throw new Error(
      'Cash payments disabled by POS settings'
    )
  }

  if (
    paymentMethod === 'CARD' &&
    !posSettings?.allow_card_payment
  ) {
    throw new Error(
      'Card payments disabled by POS settings'
    )
  }

  const state =
    await loadPaymentState({
      tenantId,
      tableNumber,
    })

  if (!state?.session) {
    throw new Error(
      'No active session found'
    )
  }

  if (Number(state.remainingBalance || 0) <= 0) {
    throw new Error(
      'No remaining balance'
    )
  }

  const actualPaid =
    paidAmount !== null
      ? Number(paidAmount)
      : Number(state.remainingBalance || 0)

  if (actualPaid <= 0) {
    throw new Error(
      'Invalid payment amount'
    )
  }

  const newPaidAmount =
    Number(
      (
        Number(state.paidAmount || 0) +
        actualPaid
      ).toFixed(2)
    )

  const remainingBalance =
    Math.max(
      0,
      Number(
        (
          Number(state.grandTotal || 0) -
          newPaidAmount
        ).toFixed(2)
      )
    )

  const isPaid =
    Number(
      remainingBalance.toFixed(2)
    ) <= 0

  const changeAmount =
    newPaidAmount > Number(state.grandTotal || 0)
      ? Number(
          (
            newPaidAmount -
            Number(state.grandTotal || 0)
          ).toFixed(2)
        )
      : 0

  const now =
    new Date().toISOString()

  const { error: paymentError } =
    await supabaseAdmin
      .from('payment_transactions')
      .insert({
        tenant_id:
          tenantId,
        table_session_id:
          state.session.id,
        table_number:
          tableNumber,
        payment_method:
          paymentMethod,
        subtotal:
          state.subtotal,
        service_charge_amount:
          state.serviceCharge,
        vat_amount:
          state.tax,
        discount_amount:
          0,
        final_total:
          state.grandTotal,
        paid_amount:
          actualPaid,
        change_amount:
          changeAmount,
        cashier_name:
          cashierName,
        status:
          isPaid
            ? 'PAID'
            : 'PARTIAL',
        created_at:
          now,
      })

  if (paymentError) {
    throw new Error(paymentError.message)
  }

  for (const order of (state.activeOrders || [])) {

    await recalculateOrderTotals(
      order.id
    )

  }

  await supabaseAdmin
    .from('orders')
    .update({
      payment_status:
        isPaid
          ? 'PAID'
          : 'PARTIAL',
      payment_method:
        paymentMethod,
      amount_paid:
        newPaidAmount,
      change_amount:
        changeAmount,
      paid_at:
        now,
      status:
        isPaid
          ? 'COMPLETED'
          : 'ACTIVE',
      ...(isPaid && {
        completed_at:
          now,
      }),
    })
    .eq('tenant_id', tenantId)
    .eq('session_id', state.session.id)

  await supabaseAdmin
    .from('table_sessions')
    .update({
      status:
        isPaid
          ? 'CLOSED'
          : 'READY_FOR_PAYMENT',
      payment_method:
        paymentMethod,
      paid_amount:
        newPaidAmount,
      final_total:
        state.grandTotal,
      service_charge_amount:
        state.serviceCharge,
      vat_amount:
        state.tax,
      paid_at:
        now,
      updated_at:
        now,
      ...(isPaid && {
        closed_at:
          now,
      }),
    })
    .eq('tenant_id', tenantId)
    .eq('id', state.session.id)

  if (isPaid) {

    console.log(
      '[SESSION STATE]',
      state.session
    )


    try {

      const itemCounts = {};

      for (const item of (state.items || [])) {

        const name =
          item.item_name || "Unknown";

        itemCounts[name] =
          (itemCounts[name] || 0) +
          Number(item.quantity || 1);

      }

      const favoriteDish =
        Object.entries(itemCounts)
          .sort(
            (a,b) => b[1] - a[1]
          )[0]?.[0] || null;

      const vipScore =
        Math.min(
          100,
          Math.floor(
            (
              Number(state.grandTotal || 0) / 100
            ) +
            (
              Number(
                state.session?.visit_count || 0
              ) * 5
            )
          )
        );

      await processCustomerVisit({

        tenantId,

        customerId:
          state.session.customer_id,

        customerName:
          state.session.customer_name,

        customerPhone:
          state.session.customer_phone,

        total:
          state.grandTotal,

        favoriteDish,

        favoriteTable:
          tableNumber,

        vipScore,

      })

    } catch (error) {

      console.error(
        '[CUSTOMER_VISIT_ERROR]',
        error
      )

    }

    console.log(
      '[ACTIVE ORDERS]',
      state.activeOrders
    )

    for (const order of (state.activeOrders || [])) {

      try {

        const productionResult =
          await processOrderProduction({

            order_id:
              order.id,

            tenant_id:
              tenantId,

          })

        console.log(
          '[PRODUCTION_PROCESS_RESULT]',
          productionResult
        )

      } catch (error) {

        console.error(
          '[PRODUCTION_PROCESS_ERROR]',
          error
        )

      }

    }

    await supabaseAdmin
      .from('restaurant_tables')
      .update({
        status:
          'AVAILABLE',
        active_session_id:
          null,
        updated_at:
          now,
      })
      .eq('tenant_id', tenantId)
      .eq('table_number', tableNumber)
  }

  await recordSystemEvent({
    tenantId,
    type: 'ORDER_PAID',
    payload: {
      session_id:
        state.session.id,
      table_number:
        tableNumber,
      amount:
        state.grandTotal,
      payment_method:
        paymentMethod,
      customer_name:
        state.session?.customer_name || null,
      customer_phone:
        state.session?.customer_phone || null,
      paid_amount:
        actualPaid,
    },
  })

  await emitEvent(
    'PAYMENT_COMPLETED',
    {
    tenantId,
    payload: {
      tableNumber,
      sessionId:
        state.session.id,
      paidAmount:
        actualPaid,
      finalTotal:
        state.grandTotal,
      remainingBalance,
      paymentMethod,
    },
  }
)

  if (isPaid) {

    await emitEvent(
      'TABLE_SESSION_CLOSED',
    {
      tenantId,
      payload: {
        tableNumber,
        sessionId:
          state.session.id,
      },
    })
  }

  return {
    success: true,
    tableNumber,
    sessionId:
      state.session.id,
    subtotal:
      state.subtotal,
    serviceCharge:
      state.serviceCharge,
    vat:
      state.tax,
    finalTotal:
      state.grandTotal,
    paidAmount:
      actualPaid,
    totalPaid:
      newPaidAmount,
    remainingBalance,
    changeAmount,
  }
}
