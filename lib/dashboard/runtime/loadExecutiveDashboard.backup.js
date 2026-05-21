import {
  loadExecutiveFinancials,
} from '@/lib/finance/dashboard/loadExecutiveFinancials'

import {
  generateOperationalPredictions,
} from '@/lib/ai/predictions/generateOperationalPredictions'

import {
  buildLivePOSMetrics,
} from '@/lib/pos/analytics/buildLivePOSMetrics'

import {
  loadApprovalTasks,
} from '@/lib/approval/runtime/loadApprovalTasks'

import {
  getOperationalAnalytics,
} from '@/lib/analytics/getOperationalAnalytics'

import {
  createSystemMetrics,
} from '@/lib/monitoring/createSystemMetrics'

import {
  generateKitchenExecutiveSummary,
} from '@/lib/kitchen/generateKitchenExecutiveSummary'

import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
loadExecutiveDashboard({

  tenantId,

}) {

  const [

    financials,

    posMetrics,

    approvals,

    operationalAnalytics,

    monitoring,

    kitchen,

  ] = await Promise.all([

    loadExecutiveFinancials({

      tenantId,

    }),

    buildLivePOSMetrics({

      tenantId,

    }),

    loadApprovalTasks({

      tenant_id:
        tenantId,

    }),

    getOperationalAnalytics({

      tenantId,

    }),

    createSystemMetrics({

      tenantId,

    }),

    generateKitchenExecutiveSummary({

      tenant_id:
        tenantId,

    }),

  ])

  const {
    data: workflowLogs,
  } = await supabaseAdmin
    .from(
      'workflow_logs'
    )
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .order(
      'created_at',
      {
        ascending: false,
      }
    )
    .limit(20)

  const {
    data: aiDecisions,
  } = await supabaseAdmin
    .from(
      'ai_decisions'
    )
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .order(
      'created_at',
      {
        ascending: false,
      }
    )
    .limit(20)

  const {
    data: incidents,
  } = await supabaseAdmin
    .from(
      'incidents'
    )
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .order(
      'created_at',
      {
        ascending: false,
      }
    )
    .limit(20)

  const predictions =
    await generateOperationalPredictions({

      financials,

      workflowLogs:
        workflowLogs || [],

      aiDecisions:
        aiDecisions || [],

    })

  return {

    financials,

    workflowLogs:
      workflowLogs || [],

    aiDecisions:
      aiDecisions || [],

    incidents:
      incidents || [],

    approvals:
      approvals || [],

    monitoring:
      monitoring || {},

    kitchen:
      kitchen || {},

    posMetrics:
      posMetrics || {},

    operationalAnalytics:
      operationalAnalytics || {},

    predictions,

  }

}
