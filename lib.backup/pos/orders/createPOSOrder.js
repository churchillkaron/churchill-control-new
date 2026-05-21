import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import calculateOrderTotals from "@/lib/pos/orders/calculateOrderTotals";

import validateOrder from "@/lib/pos/orders/validateOrder";

import buildOrderNumber from "@/lib/pos/orders/buildOrderNumber";

import {
  ORDER_STATUS,
} from "@/lib/pos/core/POS_TYPES";

export default async function createPOSOrder({
  tenant_id,
  order,
}) {

  try {

    const validation =
      validateOrder(
        order
      );

    if (
      !validation.success
    ) {

      return validation;
    }

    const totals =
      calculateOrderTotals({

        items:
          order.items,

        discount:
          order.discount,

        taxRate:
          order.taxRate,

        serviceChargeRate:
          order.serviceChargeRate,
      });

    const orderNumber =
      buildOrderNumber();

    const {
      data: orderData,
      error: orderError,
    } = await supabaseAdmin
      .from("pos_orders")
      .insert([
        {

          tenant_id,

          order_number:
            orderNumber,

          pos_type:
            order.pos_type,

          order_type:
            order.order_type,

          customer_name:
            order.customer_name,

          table_number:
            order.table_number,

          subtotal:
            totals.subtotal,

          discount:
            totals.discount,

          tax:
            totals.tax,

          service_charge:
            totals.service_charge,

          total:
            totals.total,

          status:
            ORDER_STATUS.OPEN,

          created_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (orderError) {
      throw orderError;
    }

    const orderItems =
      order.items.map(
        (item) => ({

          tenant_id,

          order_id:
            orderData.id,

          item_name:
            item.name,

          quantity:
            item.quantity,

          price:
            item.price,

          notes:
            item.notes || null,
        })
      );

    const {
      error: itemsError,
    } = await supabaseAdmin
      .from(
        "pos_order_items"
      )
      .insert(
        orderItems
      );

    if (itemsError) {
      throw itemsError;
    }

    return {

      success: true,

      order:
        orderData,

      totals,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
