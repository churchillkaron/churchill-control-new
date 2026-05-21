import {
  runEnterpriseAgent,
} from '@/lib/ai/agents/runEnterpriseAgent'

export async function
runEnterpriseSwarm({

  tenantId,

}) {

  console.log(
    '[ENTERPRISE_SWARM]'
  )

  const agents = [

    'PROCUREMENT_AGENT',

    'FINANCE_AGENT',

    'OPERATIONS_AGENT',

    'MARKETING_AGENT',

    'WORKFORCE_AGENT',

  ]

  const results = []

  for (const agent of agents) {

    try {

      const result =
        await runEnterpriseAgent({

          tenantId,

          agent,

        })

      results.push({

        success: true,

        agent,

        result,

      })

    } catch (error) {

      console.error(
        '[SWARM_AGENT_ERROR]',
        error
      )

      results.push({

        success: false,

        agent,

        error:
          error.message,

      })

    }

  }

  return results

}
