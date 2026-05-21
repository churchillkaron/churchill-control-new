import { supabase } from '@/lib/shared/supabase/client'

export async function fireCourse({
  tenantId,
  orderId,
  course = 'MAIN',
  firedBy = 'SERVICE',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!orderId) {
    throw new Error('orderId required')
  }

  const {
    data: kitchenItems,
    error: kitchenError,
  } = await supabase
    .from('kitchen_queue')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'order_id',
      orderId
    )
    .eq(
      'course',
      course
    )
    .eq(
      'status',
      'HOLD'
    )

  if (kitchenError) {
    throw new Error(
      kitchenError.message
    )
  }

  if (
    !kitchenItems ||
    kitchenItems.length === 0
  ) {

    throw new Error(
      'No held course items found'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Fire Course Items
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      status:
        'WAITING',

      fired_at:
        new Date().toISOString(),

      fired_by:
        firedBy,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'order_id',
      orderId
    )
    .eq(
      'course',
      course
    )
    .eq(
      'status',
      'HOLD'
    )

  /*
  |--------------------------------------------------------------------------
  | Update Kitchen Ticket
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_tickets')
    .update({

      status:
        'FIRED',

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'order_id',
      orderId
    )

  /*
  |--------------------------------------------------------------------------
  | Update Order
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('orders')
    .update({

      kitchen_status:
        'FIRED',

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      orderId
    )

  /*
  |--------------------------------------------------------------------------
  | Audit
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('audit_logs')
    .insert({

      tenant_id:
        tenantId,

      module:
        'kitchen',

      action:
        'FIRE_COURSE',

      reference_id:
        orderId,

      metadata: {

        course,

        fired_items:
          kitchenItems.length,

        fired_by:
          firedBy,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    orderId,

    course,

    firedItems:
      kitchenItems.length,

    status:
      'FIRED',

  }
}
