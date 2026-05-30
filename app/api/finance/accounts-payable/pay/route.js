import {
  requireAuth,
} from "@/lib/shared/auth";

import { NextResponse } from 'next/server'

import { payAccountsPayable } from '@/lib/finance/payments/payAccountsPayable'

export async function POST(req) {

  try {

    await requireAuth();

    const body =
      await req.json()

    const result =
      await payAccountsPayable({
        payable_id:
          body.payable_id,

        payment_method:
          body.payment_method,

        paid_by:
          body.paid_by,

        reference_number:
          body.reference_number,
      })

    return NextResponse.json({
      success: true,
      result,
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
