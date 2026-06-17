import { NextResponse } from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import processPOSPayment from "@/lib/pos/payments/processPOSPayment";

import { createPaymentTransaction }
from "@/lib/finance/createPaymentTransaction";

import { createJournalEntry }
from "@/lib/finance/accounting/createJournalEntry";


import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function POST(req) {

  try {

    const body =
      await req.json();

    await requireAuth();

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId,

      });

    if (!access.success) {

      return NextResponse.json(
        {
          success: false,
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    const tenant_id =
      access.tenantId;

    const paymentResult =
      await processPOSPayment(
        body
      );

    if (
      !paymentResult.success
    ) {

      return NextResponse.json(
        paymentResult,
        {
          status: 400,
        }
      );
    }

    const {
      data: order,
      error: orderError,
    } = await supabaseAdmin

      .from("pos_orders")

      .select("*")

      .eq(
        "id",
        body.order_id
      )

      .single();

    if (orderError) {

      throw orderError;

    }

    const financeTransaction =
      await createPaymentTransaction({

        tenantId:
          tenant_id,

        tableSessionId:
          null,

        tableNumber:
          order.table_number || null,

        paymentMethod:
          body.payment_type,

        subtotal:
          Number(order.subtotal || 0),

        serviceChargeAmount:
          Number(order.service_charge || 0),

        vatAmount:
          Number(order.tax || 0),

        discountAmount:
          Number(order.discount || 0),

        finalTotal:
          Number(order.total || 0),

        paidAmount:
          Number(body.amount_paid || 0),

        changeAmount:
          Number(
            paymentResult.receipt.change || 0
          ),

        createdBy:
          "system",

        cashierName:
          "POS",

        notes:
          `POS ORDER ${order.id}`,
      });

    const {
      data: cashAccount,
    } = await supabaseAdmin

      .from("chart_of_accounts")

      .select("*")

      .eq(
        "code",
        "1100"
      )

      .single();

    const {
      data: revenueAccount,
    } = await supabaseAdmin

      .from("chart_of_accounts")

      .select("*")

      .eq(
        "code",
        "4000"
      )

      .single();

    if (
      !cashAccount ||
      !revenueAccount
    ) {

      throw new Error(
        "Finance accounts missing"
      );

    }

    const journal =
      await createJournalEntry({

        tenantId:
          tenant_id,

        entryDate:
          new Date()
            .toISOString()
            .slice(0, 10),

        description:
          `POS SALE ${order.id}`,

        sourceType:
          "pos_sale",

        sourceId:
          order.id,

        createdBy:
          "system",

        lines: [

          {

            account_id:
              cashAccount.id,

            debit:
              Number(order.total || 0),

            credit:
              0,

            description:
              "Cash received",

          },

          {

            account_id:
              revenueAccount.id,

            debit:
              0,

            credit:
              Number(order.total || 0),

            description:
              "POS revenue",

          },

        ],

      });

    await supabaseAdmin

      .from("pos_realtime_events")

      .insert({

        tenant_id:
          tenant_id,

        event_type:
          "FINANCE_POSTED",

        entity_type:
          "PAYMENT",

        entity_id:
          financeTransaction.id,

        payload: {

          order_id:
            order.id,

          journal_entry:
            journal,

          payment:
            paymentResult.payment,
        },

        status:
          "PUBLISHED",

        created_at:
          new Date().toISOString(),
      });

    return NextResponse.json({

      success: true,

      payment:
        paymentResult.payment,

      finance_transaction:
        financeTransaction,

      journal,

      receipt:
        paymentResult.receipt,
    });

  } catch (error) {

    console.error(
      "POS PAYMENT FLOW ERROR",
      error
    );

    return NextResponse.json(
      {

        success: false,

        error:
          error.message,
      },
      {

        status: 500,
      }
    );
  }
}
