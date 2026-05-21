import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { calculatePaymentSummary } from '@/lib/pos/payments/calculatePaymentSummary'

import { validatePayment } from '@/lib/pos/payments/validatePayment'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      tenant_id,
      order_id,
      subtotal,
      paidAmount,
      paymentMethod,
      taxPercent,
      serviceChargePercent,
      discount,
    } = body

    const summary =
      calculatePaymentSummary({
        subtotal,
        taxPercent,
        serviceChargePercent,
        discount,
      })

    const validation =
      validatePayment({
        total:
          summary.total,
        paidAmount,
      })

    if (
      !validation.valid
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            validation.message,
        },
        {
          status: 400,
        }
      )
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('payments')
      .insert([
        {
          tenant_id,
          order_id,
          subtotal:
            summary.subtotal,
          tax:
            summary.tax,
          service_charge:
            summary.serviceCharge,
          discount:
            summary.discount,
          total:
            summary.total,
          paid_amount:
            paidAmount,
          change_amount:
            validation.change,
          payment_method:
            paymentMethod,
          status:
            'PAID',
        },
      ])
      .select()
      .single()

    if (error) {
      throw error
    }

    await supabaseAdmin
      .from('orders')
      .update({
        payment_status:
          'PAID',
        status:
          'COMPLETED',
      })
      .eq('id', order_id)

    return NextResponse.json({
      success: true,
      data,
      summary,
      change:
        validation.change,
    })

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    )
  }
}
