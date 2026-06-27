import { NextResponse } from 'next/server'

import { approveSupplierInvoice } from '@/lib/production/purchasing/workflows/approveSupplierInvoice'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await approveSupplierInvoice({
        invoice_id:
          body.invoice_id,

        approved_by:
          body.approved_by,

        notes:
          body.notes,
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
