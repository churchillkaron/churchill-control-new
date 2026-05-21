import { NextResponse }
from 'next/server'

import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

import {
  processRuntimeJob,
} from '@/lib/runtime/queue/processRuntimeJob'

export async function GET() {

  try {

    const {
      data: jobs,
      error,
    } = await supabaseAdmin
      .from(
        'runtime_jobs'
      )
      .select('*')
      .eq(
        'status',
        'PENDING'
      )
      .order(
        'created_at',
        {
          ascending: true,
        }
      )
      .limit(10)

    if (error) {

      console.error(
        '[JOB_QUEUE_ERROR]',
        error
      )

      return NextResponse.json({

        success: false,

      }, {
        status: 500,
      })

    }

    for (const job of jobs || []) {

      await processRuntimeJob(
        job
      )

    }

    return NextResponse.json({

      success: true,

      processed:
        jobs?.length || 0,

    })

  } catch (error) {

    console.error(
      '[PROCESS_JOBS_ERROR]',
      error
    )

    return NextResponse.json({

      success: false,

    }, {
      status: 500,
    })

  }

}
