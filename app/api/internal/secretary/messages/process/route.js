export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  claimSecretaryInboundMessage,
  completeSecretaryInboundMessage,
  failSecretaryInboundMessage,
} from "@/lib/operator/secretary/SecretaryMessageReceptionRuntime";
import { runSecretaryMessageReceptionRequest } from "@/lib/operator/secretary/SecretaryMessageConversationRuntime";

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
  const workerId = `secretary-message:${crypto.randomUUID()}`;
  const results = [];

  for (let index = 0; index < limit; index += 1) {
    const requestRow = await claimSecretaryInboundMessage({ workerId, leaseSeconds: 180 });
    if (!requestRow) break;

    try {
      const result = await runSecretaryMessageReceptionRequest(requestRow);
      const completed = await completeSecretaryInboundMessage({
        requestId: requestRow.id,
        patch: {
          detected_language: result.response_language,
          decision_action: result.action,
          decision: {
            action: result.action,
            response_language: result.response_language,
            response_text: result.response_text,
            caller_authority: result.caller_authority,
            internal_operator_capabilities_available: result.internal_operator_capabilities_available,
            external_authority_used: result.external_authority_used,
          },
          action_result: result.action_result || {},
          response_message_id: result.response_message?.id || null,
        },
      });
      results.push({
        request_id: requestRow.id,
        status: completed.status,
        action: result.action,
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
  return Response.json(
    {
      success: failedCount === 0,
      contract: "AVANTIQO_SECRETARY_MESSAGE_PROCESS_V1",
      processed_count: results.length,
      failed_count: failedCount,
      results,
      external_authority_used: false,
    },
    {
      status: failedCount > 0 ? 207 : 200,
      headers: { "Cache-Control": "no-store, private" },
    },
  );
}
