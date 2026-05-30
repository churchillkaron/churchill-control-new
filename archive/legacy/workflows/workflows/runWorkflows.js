import {
  getWorkflows,
} from './workflowRegistry'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import {
  createWorkflowIncident,
} from '@/lib/incidents/runtime/createWorkflowIncident'

const STALE_WORKFLOW_MINUTES = 30

function getBusinessReference(payload = {}) {
  return (
    payload?.journalEntryId ||
    payload?.saleId ||
    payload?.goodsReceiptId ||
    payload?.purchaseOrderId ||
    payload?.invoiceId ||
    payload?.paymentId ||
    payload?.orderId ||
    payload?.id ||
    crypto.randomUUID()
  )
}

export async function runWorkflows(
  event,
  payload = {}
) {
  const workflows =
    getWorkflows(event)

  const results = []

  for (const workflow of workflows) {
    const workflowName =
      workflow.name ||
      'anonymous_workflow'

    const businessReference =
      getBusinessReference(payload)

    const executionKey =
      `${event}:${workflowName}:${businessReference}`

    const {
      data: existingExecution,
    } = await supabaseAdmin
      .from('workflow_logs')
      .select('*')
      .eq('workflow_execution_key', executionKey)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingExecution?.status === 'SUCCESS') {
      console.log('[WORKFLOW_SKIPPED_SUCCESS]', executionKey)

      results.push({
        success: true,
        skipped: true,
        reason: 'SUCCESS_ALREADY_EXISTS',
        workflow: workflowName,
      })

      continue
    }

    if (existingExecution?.status === 'IN_PROGRESS') {
      const startedAt =
        new Date(existingExecution.started_at).getTime()

      const staleAt =
        Date.now() -
        STALE_WORKFLOW_MINUTES * 60 * 1000

      if (startedAt > staleAt) {
        console.log('[WORKFLOW_SKIPPED_IN_PROGRESS]', executionKey)

        results.push({
          success: true,
          skipped: true,
          reason: 'WORKFLOW_IN_PROGRESS',
          workflow: workflowName,
        })

        continue
      }

      await supabaseAdmin
        .from('workflow_logs')
        .update({
          status: 'STALE',
          completed_at: new Date().toISOString(),
          error: 'Workflow execution became stale',
        })
        .eq('id', existingExecution.id)

      await createWorkflowIncident({
        tenantId: payload.tenantId,
        event,
        workflow: workflowName,
        error: 'Workflow execution became stale',
        payload,
      })
    }

    const startedAt =
      new Date()

    await supabaseAdmin
      .from('workflow_logs')
      .insert({
        tenant_id: payload.tenantId,
        event,
        workflow: workflowName,
        workflow_execution_key: executionKey,
        status: 'IN_PROGRESS',
        payload,
        started_at: startedAt.toISOString(),
        created_at: startedAt.toISOString(),
      })

    try {
      const result =
        await workflow(payload)

      const completedAt =
        new Date()

      const durationMs =
        completedAt.getTime() -
        startedAt.getTime()

      await supabaseAdmin
        .from('workflow_logs')
        .update({
          status: 'SUCCESS',
          result,
          duration_ms: durationMs,
          completed_at: completedAt.toISOString(),
        })
        .eq('workflow_execution_key', executionKey)
        .eq('status', 'IN_PROGRESS')

      results.push({
        success: true,
        result,
        workflow: workflowName,
      })
    } catch (error) {
      const completedAt =
        new Date()

      const durationMs =
        completedAt.getTime() -
        startedAt.getTime()

      console.error('[WORKFLOW_ERROR]', event, error)

      await createWorkflowIncident({
        tenantId: payload.tenantId,
        event,
        workflow: workflowName,
        error: error.message,
        payload,
      })

      const nextRetryCount =
        Number(existingExecution?.retry_count || 0) + 1

      await supabaseAdmin
        .from('workflow_logs')
        .update({
          status: 'FAILED',
          error: error.message,
          duration_ms: durationMs,
          completed_at: completedAt.toISOString(),
          retry_count: nextRetryCount,
          dead_letter: nextRetryCount >= 3,
          replayable: nextRetryCount < 3,
        })
        .eq('workflow_execution_key', executionKey)
        .eq('status', 'IN_PROGRESS')

      results.push({
        success: false,
        error: error.message,
        workflow: workflowName,
      })
    }
  }

  return results
}
