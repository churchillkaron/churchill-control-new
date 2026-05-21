export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  receivePurchaseOrder,
} from '@/lib/procurement/services/receivePurchaseOrder'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await receivePurchaseOrder({
        tenantId: body.tenantId,
        purchaseOrderId: body.purchaseOrderId,
      })

    return NextResponse.json({
      success: true,
      result,
    })

  } catch (error) {

    console.error(error)

    return NextResponse.json(
      {
        error: error.message,
      },
      {
        status: 500,
      }
    )
  }
}
