export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  claimSecretaryFollowUpExecution,
  materializeSecretaryFollowUpExecutions,
  processSecretaryFollowUpExecution,
  reconcileQueuedSecretaryFollowUpExecutions,
} from "@/lib/operator/secretary/SecretaryFollowUpExecutionRuntime";
import {
  escalateSecretaryFollowUpExecution,
  secretaryFollowUpExecutionNeedsHumanAttention,
} from "@/lib/operator/secretary/SecretaryFollowUpEscalationRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

async function escalateOutcome(execution, outcome) {
  const reason = String(
    outcome?.outcome?.reason ||
      outcome?.execution?.last_error ||
      outcome?.last_error ||
      "",
  ).trim();
  if (!secretaryFollowUpExecutionNeedsHumanAttention(reason)) return null;
  return escalateSecretaryFollowUpExecution({
    execution: outcome?.execution || execution,
    reason,
  });
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 6, 16));
    const workerId = `secretary-follow-up:${crypto.randomUUID()}`;

    const [materialized, reconciled] = await Promise.all([
      materializeSecretaryFollowUpExecutions({ now: new Date() }),
      reconcileQueuedSecretaryFollowUpExecutions({ limit: 100 }),
    ]);

    const escalations = [];
    for (const reconciledExecution of reconciled?.executions || []) {
      const escalation = await escalateOutcome(reconciledExecution, reconciledExecution);
      if (escalation?.status === "escalated") escalations.push(escalation);
    }

    const results = [];
    for (let index = 0; index < limit; index += 1) {
      const execution = await claimSecretaryFollowUpExecution({ workerId, leaseSeconds: 180 });
      if (!execution) break;

      try {
        const processed = await processSecretaryFollowUpExecution(execution);
        const escalation = await escalateOutcome(execution, processed);
        if (escalation?.status === "escalated") escalations.push(escalation);
        results.push(processed);
      } catch (error) {
        const attempt = Math.max(1, Number(execution.attempt_count || 1));
        const exhausted = attempt >= Number(execution.max_attempts || 4);
        const retryAt = new Date(
          Date.now() + Math.min(300, 15 * 2 ** Math.min(attempt, 5)) * 1000,
        ).toISOString();
        const errorMessage = String(error?.message || error || "Follow-up execution failed").slice(0, 2000);
        const { data: updated, error: updateError } = await supabaseAdmin
          .from("secretary_follow_up_executions")
          .update({
            status: exhausted ? "SKIPPED" : "FAILED",
            available_at: retryAt,
            lease_token: null,
            lease_expires_at: null,
            completed_at: exhausted ? new Date().toISOString() : null,
            last_error: errorMessage,
            updated_at: new Date().toISOString(),
          })
          .eq("id", execution.id)
          .select("*")
          .single();
        if (updateError) throw updateError;

        if (exhausted && secretaryFollowUpExecutionNeedsHumanAttention(errorMessage)) {
          const escalation = await escalateSecretaryFollowUpExecution({
            execution: updated || execution,
            reason: errorMessage,
          });
          if (escalation?.status === "escalated") escalations.push(escalation);
        }
        results.push({
          status: exhausted ? "skipped" : "failed",
          execution_id: execution.id,
          human_attention_escalated: exhausted && secretaryFollowUpExecutionNeedsHumanAttention(errorMessage),
        });
      }
    }

    return Response.json(
      {
        success: true,
        contract: "AVANTIQO_SECRETARY_FOLLOW_UP_EXECUTION_V2",
        materialized,
        reconciled,
        processed: results.length,
        escalated: escalations.length,
        results,
        external_authority_used: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { success: false, error: String(error?.message || error || "Secretary follow-up processor failed") },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
