export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  generateKitchenLiveDashboard,
} from '@/lib/kitchen/generateKitchenLiveDashboard'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await generateKitchenLiveDashboard({

        tenantId:
          body.tenantId,

      })

    return NextResponse.json({

      success: true,

      result,

    })

  } catch (error) {

    console.error(error)

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
