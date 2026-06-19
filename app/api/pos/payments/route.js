import { NextResponse } from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  createPaymentTransaction,
} from "@/lib/finance/createPaymentTransaction";

import postPaymentAccounting
from "@/lib/payments/accounting/postPaymentAccounting";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {
    const body = await req.json();

    await requireAuth();

    const access = await requireOrganizationAccess({
      organizationId: body.organizationId,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const tenant_id = access.tenantId;

    const {
      data: order,
      error: orderError,
    } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", body.order_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (orderError || !order) {
      throw orderError || new Error("Order not found");
    }

    const finalTotal = Number(order.final_amount || order.total || 0);
    const paidAmount = Number(body.amount_paid || 0);

    if (paidAmount < finalTotal) {
      return NextResponse.json(
        {
          success: false,
          error: "INSUFFICIENT_PAYMENT",
        },
        {
          status: 400,
        }
      );
    }

    const changeAmount = Number((paidAmount - finalTotal).toFixed(2));

    const financeTransaction = await createPaymentTransaction({
      tenantId: tenant_id,
      tableSessionId: order.session_id || null,
      tableNumber: order.table_number || null,
      paymentMethod: body.payment_type,
      subtotal: Number(order.subtotal || 0),
      serviceChargeAmount: Number(order.service_charge || 0),
      vatAmount: Number(order.tax || 0),
      discountAmount: Number(order.discount || 0),
      finalTotal,
      paidAmount,
      changeAmount,
      createdBy: "system",
      cashierName: "POS",
      notes: `ORDER ${order.id}`,
    });

    const journal =
      await postPaymentAccounting({
        tenantId: tenant_id,
        paymentId:
          financeTransaction.id,
        payment: {
          amount:
            finalTotal,
        },
        createdBy:
          "system",
      });


    await supabaseAdmin
      .from("orders")
      .update({
        status: "COMPLETED",
        payment_status: "PAID",
        paid_at: new Date().toISOString(),
        payment_method: body.payment_type || null,
        amount_paid: paidAmount,
        change_amount: changeAmount,
      })
      .eq("id", order.id)
      .eq("tenant_id", tenant_id);

    return NextResponse.json({
      success: true,
      payment: financeTransaction,
      journal,
      receipt: {
        order_id: order.id,
        total: finalTotal,
        paid: paidAmount,
        change: changeAmount,
        payment_type: body.payment_type,
      },
    });
  } catch (error) {
    console.error("POS PAYMENT ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
