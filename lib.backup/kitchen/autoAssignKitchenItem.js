import { supabase } from '@/lib/shared/supabase/client'

export async function autoAssignKitchenItem({
  tenantId,
  kitchenQueueId,
  assignedBy = 'SYSTEM',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!kitchenQueueId) {
    throw new Error('kitchenQueueId required')
  }

  const {
    data: kitchenItem,
    error: kitchenItemError,
  } = await supabase
    .from('kitchen_queue')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      kitchenQueueId
    )
    .single()

  if (
    kitchenItemError ||
    !kitchenItem
  ) {

    throw new Error(
      'Kitchen queue item not found'
    )
  }

  if (
    kitchenItem.chef_id
  ) {

    throw new Error(
      'Kitchen item already assigned'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Find Best Chef
  |--------------------------------------------------------------------------
  */

  const {
    data: availableChefs,
    error: chefError,
  } = await supabase
    .from('staff_accounts')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'role',
      'CHEF'
    )
    .eq(
      'active',
      true
    )

  if (chefError) {
    throw new Error(
      chefError.message
    )
  }

  if (
    !availableChefs ||
    availableChefs.length === 0
  ) {

    throw new Error(
      'No available chefs found'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Load Current Workloads
  |--------------------------------------------------------------------------
  */

  let selectedChef = null
  let lowestWorkload = null

  for (
    const chef of availableChefs
  ) {

    const {
      data: activeItems,
    } = await supabase
      .from('kitchen_queue')
      .select('id')
      .eq(
        'tenant_id',
        tenantId
      )
      .eq(
        'chef_id',
        chef.id
      )
      .not(
        'status',
        'in',
        '(COMPLETED,BUMPED,VOIDED,SERVED)'
      )

    const workload =
      activeItems?.length || 0

    if (
      lowestWorkload === null ||
      workload < lowestWorkload
    ) {

      lowestWorkload =
        workload

      selectedChef =
        chef
    }
  }

  if (!selectedChef) {

    throw new Error(
      'Unable to auto assign chef'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Assign Chef
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      chef_id:
        selectedChef.id,

      chef_name:
        selectedChef.name,

      auto_assigned:
        true,

      auto_assigned_by:
        assignedBy,

      auto_assigned_at:
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
      kitchenQueueId
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
        'AUTO_ASSIGN_KITCHEN_ITEM',

      reference_id:
        kitchenQueueId,

      metadata: {

        order_id:
          kitchenItem.order_id,

        order_item_id:
          kitchenItem.order_item_id,

        table_number:
          kitchenItem.table_number,

        dish_name:
          kitchenItem.dish_name,

        chef_id:
          selectedChef.id,

        chef_name:
          selectedChef.name,

        workload:
          lowestWorkload,

        assigned_by:
          assignedBy,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    chefId:
      selectedChef.id,

    chefName:
      selectedChef.name,

    workload:
      lowestWorkload,

    autoAssigned:
      true,

  }
}
