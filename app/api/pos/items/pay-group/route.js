import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  createPaymentTransaction,
} from "@/lib/finance/createPaymentTransaction";

import postPaymentAccounting
from "@/lib/payments/accounting/postPaymentAccounting";

export async function POST(req) {
  try {
    const {
      itemIds,
      paymentMethod
    } = await req.json();

    console.log(
      "PAY_GROUP_METHOD",
      paymentMethod
    );

    if (!Array.isArray(itemIds) || !itemIds.length) {
      return Response.json(
        {
          success: false,
          error: "Missing items"
        },
        { status: 400 }
      );
    }

    const { data: selectedItems } = await supabaseAdmin
      .from("order_items")
      .select("*")
      .in("id", itemIds);

    if (!selectedItems?.length) {
      return Response.json(
        {
          success: false,
          error: "No items found"
        },
        { status: 400 }
      );
    }

    const firstItem =
      selectedItems?.[0];

    const orderId =
      firstItem?.order_id;

    const subtotal =
      (selectedItems || []).reduce(
        (sum, item) =>
          sum +
          (
            Number(item.price || 0) *
            Number(item.quantity || 0)
          ),
        0
      );

    console.log(
      "PAY_GROUP_SUBTOTAL",
      subtotal
    );

    const {
      data: order
    } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    const serviceCharge =
      Number(
        (subtotal * 0.05).toFixed(2)
      );

    const tax =
      Number(
        (subtotal * 0.07).toFixed(2)
      );

    const finalTotal =
      Number(
        (
          subtotal +
          serviceCharge +
          tax
        ).toFixed(2)
      );

    const paymentTransaction =
      await createPaymentTransaction({
        tenantId:
          order.tenant_id,
        tableSessionId:
          order.session_id,
        tableNumber:
          order.table_number,
        paymentMethod:
          paymentMethod || "CASH",
        subtotal,
        serviceChargeAmount:
          serviceCharge,
        vatAmount:
          tax,
        discountAmount:
          0,
        finalTotal,
        paidAmount:
          finalTotal,
        changeAmount:
          0,
        cashierName:
          "BILL_GROUP",
        notes:
          `BILL_GROUP ${order.id}`,
      });

    await postPaymentAccounting({
      tenantId:
        order.tenant_id,
      paymentId:
        paymentTransaction.id,
      payment: {
        amount:
          finalTotal,
      },
      createdBy:
        "system",
    });

console.log("PAY_GROUP_ORDER", orderId);

    const { error } = await supabaseAdmin
      .from("order_items")
      .update({
        bill_group_paid: true
      })
      .in("id", itemIds);

    if (error) throw error;

    const {
      data: unpaidItems
    } = await supabaseAdmin
      .from("order_items")
      .select("id")
      .eq("order_id", orderId)
      .eq("bill_group_paid", false);

    console.log(
  "PAY_GROUP_UNPAID",
  unpaidItems?.length || 0
);

if ((unpaidItems || []).length > 0) {

      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "PARTIAL"
        })
        .eq("id", orderId);

    } else {

      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "PAID",
          status: "COMPLETED",
          paid_at: new Date().toISOString()
        })
        .eq("id", orderId);

    }

    return Response.json({
      success: true
    });

  } catch (err) {

    return Response.json(
      {
        success: false,
        error: err.message
      },
      { status: 500 }
    );

  }
}
