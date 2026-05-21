import { supabase } from '@/lib/shared/supabase/client'

export async function fireAllHeldCourses({
  tenantId,
  orderId,
  firedBy = 'SERVICE',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!orderId) {
    throw new Error('orderId required')
  }

  const {
    data: heldItems,
    error: heldError,
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
      'status',
      'HOLD'
    )

  if (heldError) {
    throw new Error(
      heldError.message
    )
  }

  if (
    !heldItems ||
    heldItems.length === 0
  ) {

    throw new Error(
      'No held items found'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Fire All Held Items
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      status:
        'WAITING',

      fired_by:
        firedBy,

      fired_at:
        new Date().toISOString(),

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
        'WAITING',

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
        'WAITING',

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
        'FIRE_ALL_HELD_COURSES',

      reference_id:
        orderId,

      metadata: {

        fired_items:
          heldItems.length,

        fired_by:
          firedBy,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    orderId,

    firedItems:
      heldItems.length,

    status:
      'WAITING',

  }
}
