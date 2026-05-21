export const dynamic = "force-dynamic";

import { NextResponse }
from 'next/server'

export async function GET() {

  try {

    const jobsUrl =
      `${process.env.NEXT_PUBLIC_APP_URL}/api/runtime/process-jobs`

    const result =
      await fetch(
        jobsUrl
      )

    const jobs =
      await result.json()

    return NextResponse.json({

      success: true,

      scheduler: 'RUNNING',

      jobs,

      timestamp:
        new Date().toISOString(),

    })

  } catch (error) {

    console.error(
      '[SCHEDULER_ERROR]',
      error
    )

    return NextResponse.json({

      success: false,

      error:
        error.message,

    }, {
      status: 500,
    })

  }

}