export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  authorizeSecretaryCallIngress,
  secretaryCallIngressUnauthorized,
} from "@/lib/operator/secretary/SecretaryCallIngressAuth";
import {
  appendSecretaryCallTurn,
  endSecretaryCall,
} from "@/lib/operator/secretary/SecretaryCallerRuntime";

function text(value, limit = 5000) {
  return String(value ?? "").trim().slice(0, limit);
}

async function requestForUpdate(id, claimToken) {
  const result = await supabaseAdmin
    .from("secretary_outbound_call_requests")
    .select("*")
    .eq("id", id)
    .eq("claim_token", claimToken)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("SECRETARY_OUTBOUND_CLAIM_NOT_FOUND");
  if (result.data.lease_expires_at && Date.parse(result.data.lease_expires_at) < Date.now() && !["CONNECTED", "COMPLETED"].includes(result.data.status)) {
    const error = new Error("SECRETARY_OUTBOUND_CLAIM_EXPIRED");
    error.status = 409;
    throw error;
  }
  return result.data;
}

async function createConnectedCall(request) {
  if (request.call_id) return request.call_id;

  const callResult = await supabaseAdmin
    .from("secretary_calls")
    .insert({
      organization_id: request.organization_id,
      phone_line_id: request.phone_line_id,
      contact_party_id: request.contact_party_id,
      direction: "OUTBOUND",
      remote_address: request.remote_address,
      status: "ANSWERED",
      started_at: request.claimed_at || new Date().toISOString(),
      answered_at: new Date().toISOString(),
      raw_audio_persisted: false,
      metadata: {
        outbound_call_request_id: request.id,
        objective: request.objective,
        caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
        external_authority_used: false,
      },
    })
    .select("id")
    .single();
  if (callResult.error) throw callResult.error;

  await appendSecretaryCallTurn({
    callId: callResult.data.id,
    speaker: "SYSTEM",
    transcript: `Outbound call objective: ${text(request.objective, 4000)}`,
    language: request.language,
    intent: "OUTBOUND_CALL_OBJECTIVE",
    metadata: {
      outbound_call_request_id: request.id,
      restricted_external_conversation: true,
    },
  });

  const bindResult = await supabaseAdmin
    .from("secretary_outbound_call_requests")
    .update({ call_id: callResult.data.id, updated_at: new Date().toISOString() })
    .eq("id", request.id)
    .eq("claim_token", request.claim_token);
  if (bindResult.error) throw bindResult.error;
  return callResult.data.id;
}

export async function POST(request) {
  if (!authorizeSecretaryCallIngress(request)) {
    return secretaryCallIngressUnauthorized();
  }

  try {
    const body = await request.json();
    const requestId = text(body?.requestId || body?.request_id, 120);
    const claimToken = text(body?.claimToken || body?.claim_token, 120);
    const status = text(body?.status, 40).toUpperCase();
    const errorMessage = text(body?.error || body?.error_message, 3000) || null;
    const summary = text(body?.summary, 5000) || null;

    if (!requestId || !claimToken || !["DIALING", "CONNECTED", "COMPLETED", "FAILED"].includes(status)) {
      return Response.json(
        { success: false, error: "requestId, claimToken and valid status required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const outbound = await requestForUpdate(requestId, claimToken);
    let callId = outbound.call_id || null;

    if (status === "CONNECTED") {
      callId = await createConnectedCall(outbound);
    }

    if (status === "COMPLETED" && callId) {
      await endSecretaryCall({ callId, status: "COMPLETED", summary });
    }
    if (status === "FAILED" && callId) {
      await endSecretaryCall({ callId, status: "FAILED", summary: summary || errorMessage });
    }

    const patch = {
      status,
      call_id: callId,
      last_error: status === "FAILED" ? errorMessage || "Outbound call failed" : null,
      updated_at: new Date().toISOString(),
      ...(status === "COMPLETED" || status === "FAILED"
        ? { lease_expires_at: null, claim_token: null }
        : {}),
    };
    const result = await supabaseAdmin
      .from("secretary_outbound_call_requests")
      .update(patch)
      .eq("id", requestId)
      .eq("claim_token", claimToken)
      .select("id,status,call_id,attempt_count,max_attempts,last_error,updated_at")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data && !["COMPLETED", "FAILED"].includes(status)) {
      throw new Error("SECRETARY_OUTBOUND_STATUS_UPDATE_REJECTED");
    }

    return Response.json(
      {
        success: true,
        request: result.data || { id: requestId, status, call_id: callId },
        voice_turn_route: callId ? "/api/internal/secretary/calls/turn" : null,
        external_authority_used: false,
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    console.error("SECRETARY_OUTBOUND_CALL_STATUS_FAILED", error?.message || error);
    return Response.json(
      { success: false, error: error?.message || "Outbound call status failed" },
      { status: error?.status || 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
