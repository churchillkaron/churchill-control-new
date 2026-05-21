import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
registerRuntimeNode({

  nodeId,

  region,

  capabilities = [],

}) {

  console.log(
    '[RUNTIME_NODE_REGISTER]',
    nodeId
  )

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'runtime_nodes'
    )
    .upsert({

      node_id:
        nodeId,

      region,

      capabilities,

      status:
        'ONLINE',

      heartbeat_at:
        new Date()
          .toISOString(),

    })
    .select()
    .single()

  if (error) {

    console.error(
      '[NODE_REGISTER_ERROR]',
      error
    )

    return null

  }

  return data

}
