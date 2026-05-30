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

const supabase =
  supabaseAdmin

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

  const paymentAmount =
    Number(amount || 0)

  if (paymentAmount <= 0) {
    throw new Error('Invalid payment amount')
  }

  const posSettings =
    await loadOperationalSettings({
      tenantId,
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

  const { error: paymentError } =
    await supabase
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
          paymentAmount,
        change_amount:
          0,
        cashier_name:
          cashierName,
        status:
          paymentStatus,
        notes:
          'PARTIAL_PAYMENT',
        created_at:
          now,
      })

  if (paymentError) {
    throw new Error(paymentError.message)
  }

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
    .eq('tenant_id', tenantId)
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
    .eq('tenant_id', tenantId)
    .eq('id', state.session.id)

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
      .eq('tenant_id', tenantId)
      .eq('table_number', tableNumber)
  }

  await emitEvent(
    isPaid
      ? "PAYMENT_COMPLETED"
      : "PAYMENT_PARTIAL",
    {
      tenantId,
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
      newPaidAmount,
    remainingBalance,
    paymentStatus,
  }
}
