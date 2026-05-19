import { NextResponse } from 'next/server'

import { groupItemsByCourse } from '@/lib/pos/courseFire/groupItemsByCourse'

import { buildFireSequence } from '@/lib/pos/courseFire/buildFireSequence'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const grouped =
      groupItemsByCourse(
        body.items || []
      )

    const sequence =
      buildFireSequence(
        grouped
      )

    return NextResponse.json({
      success: true,
      grouped,
      sequence,
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
