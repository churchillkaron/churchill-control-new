import { createClient } from '@supabase/supabase-js'

import {
  createInventoryLedgerEntry,
} from '@/lib/inventory/services/createInventoryLedgerEntry'

const supabase =
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

export async function receivePurchaseOrder({
  tenantId,
  purchaseOrderId,
}) {

  if (!tenantId || !purchaseOrderId) {
    throw new Error('tenantId and purchaseOrderId required')
  }

  const {
    data: purchaseOrder,
    error: poError,
  } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', purchaseOrderId)
    .single()

  if (poError || !purchaseOrder) {
    throw new Error('Purchase order not found')
  }

  const {
    data: lines,
    error: lineError,
  } = await supabase
    .from('purchase_order_lines')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('purchase_order_id', purchaseOrderId)

  if (lineError) {
    throw new Error(lineError.message)
  }

  const receipt = {
    tenant_id: tenantId,
    purchase_order_id: purchaseOrderId,
    status: 'received',
    received_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }

  const {
    data: goodsReceipt,
    error: receiptError,
  } = await supabase
    .from('goods_receipts')
    .insert(receipt)
    .select('*')
    .single()

  if (receiptError) {
    throw new Error(receiptError.message)
  }

  for (const line of lines || []) {
    const quantity = Number(line.quantity || 0)
    const unitCost = Number(line.unit_cost || 0)

    const {
      data: ingredient,
      error: ingredientError,
    } = await supabase
      .from('ingredients')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', line.ingredient_id)
      .single()

    if (ingredientError || !ingredient) {
      throw new Error(`Ingredient not found: ${line.ingredient_id}`)
    }

    const newQuantity =
      Number(ingredient.quantity || 0) + quantity

    await supabase
      .from('ingredients')
      .update({
        quantity: newQuantity,
        unit_cost: unitCost,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', line.ingredient_id)

    await supabase
      .from('goods_receipt_items')
      .insert({
        tenant_id: tenantId,
        goods_receipt_id: goodsReceipt.id,
        purchase_order_id: purchaseOrderId,
        ingredient_id: line.ingredient_id,
        quantity_received: quantity,
        unit_cost: unitCost,
        total_cost: quantity * unitCost,
        created_at: new Date().toISOString(),
      })

    await createInventoryLedgerEntry({
      tenantId,
      ingredientId: line.ingredient_id,
      orderId: purchaseOrderId,
      movementType: 'PURCHASE_RECEIVED',
      quantity,
      unitCost,
    })
  }

  await supabase
    .from('purchase_orders')
    .update({
      status: 'received',
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', purchaseOrderId)

  return {
    success: true,
    goodsReceiptId: goodsReceipt.id,
  }
}
