import { supabase } from '@/lib/shared/supabase/client'

import loadOperationalSettings
from '@/lib/settings/loadOperationalSettings'

export async function applyDiscount({
  organizationId,
  orderId,
  discountType = 'PERCENTAGE',
  discountValue = 0,
  reason = 'Discount',
  approvedBy = 'MANAGER',
}) {

  if (!organizationId) {
    throw new Error('organizationId required')
  }

  if (!orderId) {
    throw new Error('orderId required')
  }

  const posSettings =
    await loadOperationalSettings({

      organizationId,

      domain:
        'POS',

    })

  if (
    posSettings?.require_manager_discount_approval &&
    approvedBy !== 'MANAGER'
  ) {

    throw new Error(
      'Manager approval required for discounts'
    )

  }

  const {
    data: order,
    error: orderError,
  } = await supabase
    .from('orders')
    .select('*')
    .eq(
      'organization_id',
      organizationId
    )
    .eq(
      'id',
      orderId
    )
    .single()

  if (orderError || !order) {
    throw new Error(
      'Order not found'
    )
  }

  if (
    order.payment_status === 'PAID'
  ) {

    throw new Error(
      'Cannot discount paid order'
    )
  }

  const originalTotal =
    Number(
      order.total_amount ||
      order.total ||
      0
    )

  let discountAmount = 0

  if (
    discountType === 'PERCENTAGE'
  ) {

    discountAmount =
      Number(
        (
          originalTotal *
          (
            Number(discountValue) / 100
          )
        ).toFixed(2)
      )

  } else {

    discountAmount =
      Number(discountValue)
  }

  if (
    discountAmount > originalTotal
  ) {

    throw new Error(
      'Discount exceeds order total'
    )
  }

  const discountedTotal =
    Number(
      (
        originalTotal -
        discountAmount
      ).toFixed(2)
    )

  const {
    error: updateError,
  } = await supabase
    .from('orders')
    .update({

      total_amount:
        discountedTotal,

      discount_amount:
        discountAmount,

      discount_type:
        discountType,

      discount_reason:
        reason,

      discount_approved_by:
        approvedBy,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'organization_id',
      organizationId
    )
    .eq(
      'id',
      orderId
    )

  if (updateError) {
    throw new Error(
      updateError.message
    )
  }

  await supabase
    .from('audit_logs')
    .insert({

      organization_id:
        organizationId,

      module:
        'pos',

      action:
        'APPLY_DISCOUNT',

      reference_id:
        orderId,

      metadata: {

        original_total:
          originalTotal,

        discounted_total:
          discountedTotal,

        discount_amount:
          discountAmount,

        discount_type:
          discountType,

        approved_by:
          approvedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    orderId,

    originalTotal,

    discountAmount,

    discountedTotal,

  }
}
