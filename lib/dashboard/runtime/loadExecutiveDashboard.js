import { supabase } from '@/lib/shared/supabase/client'

import {
  loadExecutiveFinancials,
} from '@/lib/finance/dashboard/loadExecutiveFinancials'

import {
  buildLivePOSMetrics,
} from '@/lib/pos/analytics/buildLivePOSMetrics'

import {
  loadApprovalTasks,
} from '@/lib/approval/runtime/loadApprovalTasks'

import {
  getOperationalAnalytics,
} from '@/lib/analytics/getOperationalAnalytics'

import createSystemMetrics
from '@/lib/monitoring/createSystemMetrics'

import {
  generateKitchenExecutiveSummary,
} from '@/lib/kitchen/generateKitchenExecutiveSummary'

import {
  generateOperationalPredictions,
} from '@/lib/ai/predictions/generateOperationalPredictions'

export async function loadExecutiveDashboard({

  tenantId,

}) {

  const financials =
    await loadExecutiveFinancials({
      tenantId,
    })

  const posMetrics =
    await buildLivePOSMetrics({
      tenantId,
    })

  const approvals =
    await loadApprovalTasks(
      tenantId
    )

  const operationalAnalytics =
    await getOperationalAnalytics({
      tenantId,
    })

  const monitoring =
    await createSystemMetrics({
      tenantId,
    })

  const kitchen =
    await generateKitchenExecutiveSummary({

      tenant_id:
        tenantId,

    })

  const {
    data: workflowLogs,
  } = await supabase
    .from('workflow_logs')
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(20)

  const {
    data: aiDecisions,
  } = await supabase
    .from('ai_decisions')
    .select('*')
    .eq('tenant_id', tenantId)
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

    financials:
      financials || {},

    posMetrics:
      posMetrics || {},

    approvals:
      approvals || [],

    operationalAnalytics:
      operationalAnalytics || {},

    monitoring:
      monitoring || {},

    workflowLogs:
      workflowLogs || [],

    aiDecisions:
      aiDecisions || [],

    kitchen:
      kitchen || {},

    predictions:
      predictions || [],

    runtime: {

      generatedAt:
        new Date().toISOString(),

      tenantId,

      workflowCount:
        (workflowLogs || []).length,

      aiDecisionCount:
        (aiDecisions || []).length,

      approvalCount:
        (approvals || []).length,

      predictionCount:
        (predictions || []).length,

      kitchenStatus:
        kitchen?.kitchenLoad || 'LOW',

    },

  }

}
