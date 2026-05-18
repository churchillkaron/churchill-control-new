import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function receivePurchaseOrder({
  purchase_order_id,
  received_by = "WAREHOUSE",
}) {

  try {

    // ===== LOAD PO =====
    const {
      data: po,
      error: poError,
    } = await supabaseAdmin
      .from("purchase_orders")
      .select(`
        *,
        purchase_order_items (*)
      `)
      .eq(
        "id",
        purchase_order_id
      )
      .single();

    if (poError) {
      throw poError;
    }

    // ===== CREATE GOODS RECEIPT =====
    const {
      data: receipt,
      error: receiptError,
    } = await supabaseAdmin
      .from("goods_receipts")
      .insert([
        {

          tenant_id:
            po.tenant_id,

          purchase_order_id:
            po.id,

          received_by,

          received_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (receiptError) {
      throw receiptError;
    }

    // ===== PROCESS ITEMS =====
    for (const item of po.purchase_order_items || []) {

      // ===== UPDATE INVENTORY =====
      const {
        data: ingredient,
        error: ingredientError,
      } = await supabaseAdmin
        .from("ingredients")
        .select("*")
        .eq(
          "id",
          item.ingredient_id
        )
        .single();

      if (ingredientError) {
        throw ingredientError;
      }

      const previousQuantity =
        Number(
          ingredient.quantity || 0
        );

      const receivedQuantity =
        Number(
          item.quantity || 0
        );

      const newQuantity =
        previousQuantity +
        receivedQuantity;

      const {
        error: updateError,
      } = await supabaseAdmin
        .from("ingredients")
        .update({

          quantity:
            newQuantity,
        })
        .eq(
          "id",
          ingredient.id
        );

      if (updateError) {
        throw updateError;
      }

      // ===== GOODS RECEIPT ITEMS =====
      const {
        error: receiptItemError,
      } = await supabaseAdmin
        .from(
          "goods_receipt_items"
        )
        .insert([
          {

            tenant_id:
              po.tenant_id,

            goods_receipt_id:
              receipt.id,

            ingredient_id:
              item.ingredient_id,

            ingredient_name:
              item.ingredient_name,

            quantity:
              receivedQuantity,

            created_at:
              new Date().toISOString(),
          },
        ]);

      if (receiptItemError) {
        throw receiptItemError;
      }

      // ===== INVENTORY LEDGER =====
      const {
        error: ledgerError,
      } = await supabaseAdmin
        .from(
          "inventory_ledger"
        )
        .insert([
          {

            tenant_id:
              po.tenant_id,

            ingredient_id:
              ingredient.id,

            ingredient_name:
              ingredient.name,

            movement_type:
              "GOODS_RECEIPT",

            quantity:
              receivedQuantity,

            previous_quantity:
              previousQuantity,

            new_quantity:
              newQuantity,

            reference_type:
              "GOODS_RECEIPT",

            reference_id:
              receipt.id,

            created_at:
              new Date().toISOString(),
          },
        ]);

      if (ledgerError) {
        throw ledgerError;
      }
    }

    // ===== UPDATE PO STATUS =====
    await supabaseAdmin
      .from("purchase_orders")
      .update({

        status:
          "RECEIVED",
      })
      .eq(
        "id",
        po.id
      );

    return {

      success: true,

      goods_receipt:
        receipt,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
