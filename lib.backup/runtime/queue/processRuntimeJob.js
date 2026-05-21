import {
  emitEvent,
} from '@/lib/shared/events/eventBus'

import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
processRuntimeJob(
  job
) {

  console.log(
    '[PROCESS_RUNTIME_JOB]',
    job.type
  )

  try {

    await supabaseAdmin
      .from(
        'runtime_jobs'
      )
      .update({

        status:
          'PROCESSING',

      })
      .eq(
        'id',
        job.id
      )

    // ===== EXECUTE =====

    await emitEvent(

      job.type,

      job.payload || {}

    )

    await supabaseAdmin
      .from(
        'runtime_jobs'
      )
      .update({

        status:
          'COMPLETED',

      })
      .eq(
        'id',
        job.id
      )

  } catch (error) {

    console.error(
      '[JOB_PROCESSING_ERROR]',
      error
    )

    await supabaseAdmin
      .from(
        'runtime_jobs'
      )
      .update({

        status:
          'FAILED',

        error:
          error.message,

      })
      .eq(
        'id',
        job.id
      )

  }

}
