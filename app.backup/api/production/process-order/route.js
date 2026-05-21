import { NextResponse } from 'next/server'
import { processOrderProduction } from '@/lib/production/processOrderProduction'

export async function POST(req) {
  try {
    const body = await req.json()

    const result = await processOrderProduction(body)

    return NextResponse.json(result)
  } catch (error) {
    console.error('PROCESS ORDER PRODUCTION ERROR:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    )
  }
}
