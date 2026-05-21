import { getServiceSupabase } from '@/lib/shared/supabase/service'

import {
  createInventoryLedgerEntry,
} from '@/lib/inventory/services/createInventoryLedgerEntry'

import {
  createAccountsPayableInvoice,
} from '@/lib/finance/services/createAccountsPayableInvoice'

const supabase = getServiceSupabase()

export async function receivePurchaseOrder({
  tenantId,
  purchaseOrderId,
}) {

  if (!tenantId || !purchaseOrderId) {
    throw new Error(
      'tenantId and purchaseOrderId required'
    )
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
    const quantity =
      Number(line.quantity || 0)

    const unitCost =
      Number(line.unit_cost || 0)

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
      throw new Error(
        `Ingredient not found: ${line.ingredient_id}`
      )
    }

    const newQuantity =
      Number(ingredient.quantity || 0) +
      quantity

    const {
      error: updateIngredientError,
    } = await supabase
      .from('ingredients')
      .update({
        quantity: newQuantity,
        unit_cost: unitCost,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', line.ingredient_id)

    if (updateIngredientError) {
      throw new Error(updateIngredientError.message)
    }

    const {
      error: receiptItemError,
    } = await supabase
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

    if (receiptItemError) {
      throw new Error(receiptItemError.message)
    }

    await createInventoryLedgerEntry({
      tenantId,
      ingredientId: line.ingredient_id,
      orderId: purchaseOrderId,
      movementType: 'PURCHASE_RECEIVED',
      quantity,
      unitCost,
    })
  }

  const {
    error: updatePoError,
  } = await supabase
    .from('purchase_orders')
    .update({
      status: 'received',
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', purchaseOrderId)

  if (updatePoError) {
    throw new Error(updatePoError.message)
  }

  const apInvoice =
    await createAccountsPayableInvoice({
      tenantId,
      purchaseOrderId,
    })

  return {
    success: true,
    purchaseOrderId,
    goodsReceiptId: goodsReceipt.id,
    apInvoice,
  }
}
