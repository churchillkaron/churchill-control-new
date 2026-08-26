export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  claimSecretaryInboundMessage,
  completeSecretaryInboundMessage,
  failSecretaryInboundMessage,
} from "@/lib/operator/secretary/SecretaryMessageReceptionRuntime";
import { runSecretaryMessageReceptionAutonomous } from "@/lib/operator/secretary/SecretaryAutonomousCallbackRuntime";
import {
  recordSecretaryInboundTriage,
  reconcileSecretaryWaitingExternal,
} from "@/lib/operator/secretary/SecretaryInboxTriageRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 4, 12));
  const waitHours = Math.max(1, Math.min(Number(url.searchParams.get("wait_hours")) || 24, 24 * 14));
  const workerId = `secretary-message:${crypto.randomUUID()}`;
  const results = [];
  let waitingExternal = null;

  try {
    waitingExternal = await reconcileSecretaryWaitingExternal({
      waitHours,
      limit: Math.max(10, limit * 4),
    });
  } catch (error) {
    waitingExternal = {
      status: "failed",
      error: error?.message || "Secretary waiting-external reconciliation failed",
      processed_count: 0,
      results: [],
      external_authority_used: false,
    };
  }

  for (let index = 0; index < limit; index += 1) {
    const requestRow = await claimSecretaryInboundMessage({ workerId, leaseSeconds: 180 });
    if (!requestRow) break;

    try {
      const result = await runSecretaryMessageReceptionAutonomous(requestRow);
      const completed = await completeSecretaryInboundMessage({
        requestId: requestRow.id,
        patch: {
          detected_language: result.response_language,
          decision_action: result.action,
          decision: {
            action: result.action,
            response_language: result.response_language,
            response_text: result.response_text,
            business_hours_state: result.business_hours_state || null,
            server_allowed_actions: result.server_allowed_actions || null,
            callback_autonomy_promoted: result.callback_autonomy_promoted === true,
            callback_follow_up_id: result.callback_follow_up_id || null,
            caller_authority: result.caller_authority,
            internal_operator_capabilities_available: result.internal_operator_capabilities_available,
            external_authority_used: result.external_authority_used,
          },
          action_result: result.action_result || {},
          response_message_id: result.response_message?.id || null,
        },
      });
      const triage = await recordSecretaryInboundTriage({
        request: { ...requestRow, ...completed },
        result,
      });
      results.push({
        request_id: requestRow.id,
        status: completed.status,
        action: result.action,
        triage_category: triage.triage?.category || null,
        triage_priority: triage.triage?.priority || null,
        executive_attention_required: triage.executive_attention_required === true,
        secretary_owns_follow_through: triage.secretary_owns_follow_through === true,
        secretary_job_id: triage.secretary_job?.id || null,
        after_hours_mode: result.business_hours_state?.after_hours_mode || null,
        callback_autonomy_promoted: result.callback_autonomy_promoted === true,
        response_message_id: result.response_message?.id || null,
      });
    } catch (error) {
      const failed = await failSecretaryInboundMessage({
        requestId: requestRow.id,
        error,
        retryDelaySeconds: Math.min(300, 15 * 2 ** Math.min(Number(requestRow.attempt_count || 1), 5)),
      });
      results.push({
        request_id: requestRow.id,
        status: failed.status,
        error: error?.message || "Secretary message processing failed",
      });
    }
  }

  const failedCount = results.filter((item) => ["FAILED", "SKIPPED"].includes(String(item.status || "").toUpperCase())).length;
  const reconcileFailed = waitingExternal?.status === "failed";
  return Response.json(
    {
      success: failedCount === 0 && !reconcileFailed,
      contract: "AVANTIQO_SECRETARY_MESSAGE_PROCESS_V2",
      processed_count: results.length,
      failed_count: failedCount,
      results,
      inbox_triage_enabled: true,
      inbox_triage_executive_attention_is_exception_based: true,
      inbox_triage_high_authority_fails_closed: true,
      inbox_triage_secretary_job_follow_through: true,
      waiting_external_reconciliation: waitingExternal,
      waiting_external_reconciliation_server_side: true,
      waiting_external_secretary_owned_chasing: true,
      waiting_external_high_authority_auto_chase_blocked: true,
      external_authority_used: false,
    },
    {
      status: failedCount > 0 || reconcileFailed ? 207 : 200,
      headers: { "Cache-Control": "no-store, private" },
    },
  );
}
