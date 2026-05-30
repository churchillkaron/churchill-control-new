import { supabaseAdmin } from '@/lib/shared/supabase/admin'
import { createCogsEntry } from '@/lib/finance/createCogsEntry'

export async function processOrderProduction({
  order_id,
  tenant_id,
}) {

  if (!order_id) {
    throw new Error(
      'Order ID required'
    )
  }

  if (!tenant_id) {
    throw new Error(
      'Tenant ID required'
    )
  }

  // -----------------------------------
  // LOAD ORDER
  // -----------------------------------

  const {
    data: order,
    error: orderLoadError,
  } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq(
      'id',
      order_id
    )
    .eq(
      'tenant_id',
      tenant_id
    )
    .single()

  if (orderLoadError) {
    throw new Error(
      orderLoadError.message
    )
  }

  // -----------------------------------
  // GOVERNANCE VALIDATION
  // -----------------------------------

  if (
    order.production_processed === true
  ) {

    return {
      success: true,
      skipped: true,
      reason:
        'Production already processed',
    }
  }

  if (
    order.status !== 'CLOSED'
  ) {

    return {
      success: false,
      error:
        'Order not completed',
    }
  }

  if (
    order.payment_status !== 'PAID'
  ) {

    return {
      success: false,
      error:
        'Order not paid',
    }
  }

  // -----------------------------------
  // LOAD SALES ITEMS
  // -----------------------------------

  const {
    data: orderItems,
    error: orderError,
  } = await supabaseAdmin
    .from("order_items")
    .select('*')
    .eq(
      'order_id',
      order_id
    )
    .eq(
      'tenant_id',
      tenant_id
    )

  if (orderError) {

    console.error(
      'ORDER ITEMS ERROR',
      orderError
    )

    throw new Error(
      orderError.message
    )
  }

  if (
    !orderItems ||
    orderItems.length === 0
  ) {

    return {
      success: false,
      error:
        'No order items found',
    }
  }

  // -----------------------------------
  // PROCESS ITEMS
  // -----------------------------------

  for (const orderItem of orderItems) {

    const {
      data: recipeItems,
      error: recipeError,
    } = await supabaseAdmin
      .from('recipe_items')
      .select(`
        *,
        ingredients (
          id,
          name,
          quantity,
          cost_per_unit
        )
      `)
      .eq(
        'dish_id',
        orderItem.dish_id
      )
      .eq(
        'tenant_id',
        tenant_id
      )

    if (recipeError) {
      throw new Error(
        recipeError.message
      )
    }

    if (
      !recipeItems ||
      recipeItems.length === 0
    ) {
      continue
    }

    let totalDishCost = 0

    for (const recipe of recipeItems) {

      const ingredient =
        recipe.ingredients

      if (!ingredient) {
        continue
      }

      const usageQuantity =
        Number(
          recipe.quantity || 0
        ) *
        Number(
          orderItem.quantity || 0
        )

      const currentStock =
        Number(
          ingredient.quantity || 0
        )

      const newStock =
        currentStock -
        usageQuantity

      const ingredientCost =
        Number(
          ingredient.cost_per_unit || 0
        ) *
        usageQuantity

      totalDishCost +=
        ingredientCost

      const {
        error:
          updateIngredientError,
      } = await supabaseAdmin
        .from('ingredients')
        .update({
          quantity:
            newStock,
        })
        .eq(
          'id',
          ingredient.id
        )
        .eq(
          'tenant_id',
          tenant_id
        )

      if (
        updateIngredientError
      ) {

        throw new Error(
          updateIngredientError.message
        )
      }

      await supabaseAdmin
        .from(
          'inventory_movements'
        )
        .insert({

          tenant_id,

          ingredient_id:
            ingredient.id,

          type:
            'usage',

          quantity:
            usageQuantity,

          reference_id:
            order_id,

          notes:
            `Production deduction for order ${order_id}`,

          created_at:
            new Date(),
        })
    }

    await supabaseAdmin
      .from(
        'daily_sales_items'
      )
      .update({

        cost:
          totalDishCost,

        revenue:
          Number(
            orderItem.price || 0
          ) *
          Number(
            orderItem.quantity || 0
          ),

      })
      .eq(
        'id',
        orderItem.id
      )

    await createCogsEntry({

      tenantId:
        tenant_id,

      orderId:
        order_id,

      dishId:
        orderItem.dish_id,

      quantity:
        Number(
          orderItem.quantity || 0
        ),

      revenueAmount:
        Number(
          orderItem.price || 0
        ) *
        Number(
          orderItem.quantity || 0
        ),

      createdBy:
        'system',

    })

  }

  // -----------------------------------
  // LOCK PROCESSING
  // -----------------------------------

  await supabaseAdmin
    .from('orders')
    .update({

      production_processed: true,

      production_processed_at:
        new Date().toISOString(),

    })
    .eq(
      'id',
      order_id
    )
    .eq(
      'tenant_id',
      tenant_id
    )

  return {
    success: true,
  }
}
