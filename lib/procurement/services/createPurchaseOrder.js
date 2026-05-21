import { getServiceSupabase } from '@/lib/shared/supabase/service'

const supabase = getServiceSupabase()

export async function createPurchaseOrder({
  tenantId,
  purchaseRequestId,
}) {

  if (!tenantId || !purchaseRequestId) {

    throw new Error(
      'tenantId and purchaseRequestId required'
    )
  }

  const {
    data: request,
    error: requestError,
  } = await supabase
    .from('purchase_requests')
    .select(`
      *,
      ingredients (*)
    `)
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      purchaseRequestId
    )
    .single()

  if (requestError || !request) {

    throw new Error(
      'Purchase request not found'
    )
  }

  const ingredient =
    request.ingredients

  const unitCost =
    Number(
      ingredient?.unit_cost ||
      ingredient?.cost ||
      0
    )

  const quantity =
    Number(
      request.quantity || 0
    )

  const total =
    quantity * unitCost

  const po = {

    tenant_id:
      tenantId,

    purchase_request_id:
      purchaseRequestId,

    status:
      'pending',

    supplier_id:
      ingredient?.supplier_id || null,

    subtotal:
      total,

    total,

    notes:
      `Auto-generated PO for ${ingredient?.name}`,

    created_at:
      new Date().toISOString(),

  }

  const {
    data: purchaseOrder,
    error: poError,
  } = await supabase
    .from('purchase_orders')
    .insert(po)
    .select('*')
    .single()

  if (poError) {
    throw new Error(poError.message)
  }

  const line = {

    tenant_id:
      tenantId,

    purchase_order_id:
      purchaseOrder.id,

    ingredient_id:
      ingredient.id,

    quantity,

    unit_cost:
      unitCost,

    total_cost:
      total,

    created_at:
      new Date().toISOString(),

  }

  const {
    error: lineError,
  } = await supabase
    .from('purchase_order_lines')
    .insert(line)

  if (lineError) {
    throw new Error(lineError.message)
  }

  await supabase
    .from('purchase_requests')
    .update({

      status:
        'converted_to_po',

      purchase_order_id:
        purchaseOrder.id,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      purchaseRequestId
    )

  return {

    success: true,

    purchaseOrder,

  }
}
