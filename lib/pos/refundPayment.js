import { supabase } from '@/lib/shared/supabase/client'

import loadOperationalSettings
from '@/lib/settings/loadOperationalSettings'

export async function refundPayment({
  tenantId,
  paymentTransactionId,
  reason = 'Refund',
  refundedBy = 'SYSTEM',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!paymentTransactionId) {
    throw new Error(
      'paymentTransactionId required'
    )
  }

  const posSettings =
    await loadOperationalSettings({

      tenantId,

      domain:
        'POS',

    })

  if (
    !posSettings?.allow_refunds
  ) {

    throw new Error(
      'Refunds disabled by POS settings'
    )

  }

  if (
    posSettings?.require_manager_refund_approval &&
    refundedBy !== 'MANAGER'
  ) {

    throw new Error(
      'Manager approval required for refunds'
    )

  }

  const {
    data: payment,
    error: paymentError,
  } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      paymentTransactionId
    )
    .single()

  if (paymentError || !payment) {
    throw new Error(
      'Payment transaction not found'
    )
  }

  if (
    payment.status === 'REFUNDED'
  ) {

    throw new Error(
      'Payment already refunded'
    )
  }

  const {
    error: refundError,
  } = await supabase
    .from('payment_transactions')
    .update({

      status:
        'REFUNDED',

      refund_reason:
        reason,

      refunded_by:
        refundedBy,

      refunded_at:
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
      paymentTransactionId
    )

  if (refundError) {
    throw new Error(
      refundError.message
    )
  }

  const {
    error: orderError,
  } = await supabase
    .from('orders')
    .update({

      payment_status:
        'REFUNDED',

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'table_number',
      payment.table_number
    )

  if (orderError) {
    throw new Error(
      orderError.message
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
        'REFUND_PAYMENT',

      reference_id:
        paymentTransactionId,

      metadata: {

        table_number:
          payment.table_number,

        total:
          payment.final_total,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    paymentTransactionId,

    refundedAmount:
      payment.final_total,

  }
}
