export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {
    const {
      invoiceId,
      paymentReference,
    } = await req.json();

    if (!invoiceId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing invoiceId",
        },
        {
          status: 400,
        }
      );
    }

    const { data: invoice, error: invoiceError } =
      await supabaseAdmin
        .from("billing_invoices")
        .update({
          status: "paid",
        })
        .eq("id", invoiceId)
        .select()
        .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        {
          success: false,
          error: invoiceError?.message || "Invoice not found",
        },
        {
          status: 400,
        }
      );
    }

    await supabaseAdmin
      .from("tenant_audit_logs")
      .insert({
        tenant_id: invoice.tenant_id,
        action: "BILLING_INVOICE_PAID",
        metadata: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          amount: invoice.amount,
          payment_reference: paymentReference || null,
        },
      });

    return NextResponse.json({
      success: true,
      invoice,
    });
  } catch (error) {
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
