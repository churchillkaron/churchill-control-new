export const dynamic = 'force-dynamic'

import {
  requireAuth,
} from "@/lib/shared/auth";

import { NextResponse } from 'next/server'

import {
  createPurchaseOrder,
} from '@/lib/procurement/services/createPurchaseOrder'

export async function POST(req) {

  try {

    await requireAuth();

    const body =
      await req.json()

    const result =
      await createPurchaseOrder({

        tenantId:
          body.tenantId,

        purchaseRequestId:
          body.purchaseRequestId,

      })

    return NextResponse.json({

      success: true,

      result,

    })

  } catch (error) {

    console.error(error)

    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      }
    )
  }
}
