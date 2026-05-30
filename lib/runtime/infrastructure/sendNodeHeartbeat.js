import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
sendNodeHeartbeat(
  nodeId
) {

  await supabaseAdmin
    .from(
      'runtime_nodes'
    )
    .update({

      heartbeat_at:
        new Date()
          .toISOString(),

      status:
        'ONLINE',

    })
    .eq(
      'node_id',
      nodeId
    )

}
