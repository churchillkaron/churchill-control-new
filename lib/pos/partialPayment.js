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
  processOrderProduction,
} from '@/lib/production/processOrderProduction'

import {
  createPaymentTransaction,
} from '@/lib/finance/createPaymentTransaction'

import { postPaymentAccounting }
from '@/lib/payments/accounting/postPaymentAccounting'

const supabase =
  supabaseAdmin

export async function partialPayment({
  organizationId,
  tableNumber,
  paymentMethod = 'CASH',
  amount = 0,
  cashierName = 'SYSTEM',
}) {
  if (!organizationId) {
    throw new Error('organizationId required')
  }

  if (!tableNumber) {
    throw new Error('tableNumber required')
  }

  const paymentAmount =
    Number(amount || 0)

  if (paymentAmount <= 0) {
    throw new Error('Invalid payment amount')
  }

  const posSettings =
    await loadOperationalSettings({
      organizationId,
      domain:
        'POS',
    })

  if (!posSettings?.allow_partial_payment) {
    throw new Error(
      'Partial payment disabled by POS settings'
    )
  }

  const state =
    await loadPaymentState({
      organizationId,
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

  if (paymentAmount > Number(state.remainingBalance || 0)) {
    throw new Error(
      'Payment exceeds balance'
    )
  }

  const newPaidAmount =
    Number(
      (
        Number(state.paidAmount || 0) +
        paymentAmount
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

  const paymentStatus =
    isPaid
      ? 'PAID'
      : 'PARTIAL'

  const now =
    new Date().toISOString()

  const paymentTransaction =
    await createPaymentTransaction({
    organizationId,
    tableSessionId:
      state.session.id,
    tableNumber,
    paymentMethod,
    subtotal:
      state.subtotal,
    serviceChargeAmount:
      state.serviceCharge,
    vatAmount:
      state.tax,
    discountAmount:
      0,
    finalTotal:
      state.grandTotal,
    paidAmount:
      paymentAmount,
    changeAmount:
      0,
    cashierName,
    notes:
      'PARTIAL_PAYMENT',
  })

  await postPaymentAccounting({
    organizationId,
    paymentId:
      paymentTransaction.id,
    payment: {
      amount:
        paymentAmount,
    },
    createdBy:
      cashierName,
  })

  await supabase
    .from('orders')
    .update({
      payment_status:
        paymentStatus,
      status:
        isPaid
          ? 'COMPLETED'
          : 'ACTIVE',
      ...(isPaid && {
        completed_at:
          now,
      }),
    })
    .eq('organization_id', organizationId)
    .eq('session_id', state.session.id)

  await supabase
    .from('table_sessions')
    .update({
      status:
        isPaid
          ? 'CLOSED'
          : 'READY_FOR_PAYMENT',
      paid_amount:
        newPaidAmount,
      final_total:
        state.grandTotal,
      service_charge_amount:
        state.serviceCharge,
      vat_amount:
        state.tax,
      payment_method:
        paymentMethod,
      updated_at:
        now,
      ...(isPaid && {
        paid_at:
          now,
        closed_at:
          now,
      }),
    })
    .eq('organization_id', organizationId)
    .eq('id', state.session.id)

  if (isPaid) {
    for (const order of (state.activeOrders || [])) {
      try {
        const productionResult =
          await processOrderProduction({
            order_id:
              order.id,
            organization_id:
              organizationId,
          })

        console.log(
          '[PARTIAL_PAYMENT_PRODUCTION_RESULT]',
          productionResult
        )
      } catch (error) {
        console.error(
          '[PARTIAL_PAYMENT_PRODUCTION_ERROR]',
          error
        )
      }
    }
  }

  if (isPaid) {
    await supabase
      .from('restaurant_tables')
      .update({
        status:
          'AVAILABLE',
        active_session_id:
          null,
        updated_at:
          now,
      })
      .eq('organization_id', organizationId)
      .eq('table_number', tableNumber)
  }

  await emitEvent(
    isPaid
      ? "PAYMENT_COMPLETED"
      : "PAYMENT_PARTIAL",
    {
      organizationId,
      payload: {
      tableNumber,
      amount:
        paymentAmount,
      paidAmount:
        newPaidAmount,
      remainingBalance,
      sessionId:
        state.session.id,
      finalTotal:
        state.grandTotal,
      paymentMethod,
    },
  }
)

  if (isPaid) {
    await emitEvent(
      'TABLE_SESSION_CLOSED',
    {
      organizationId,
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
      newPaidAmount,
    remainingBalance,
    paymentStatus,
  }
}
