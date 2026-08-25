import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function baseUrl(value) {
  const clean = text(value, 1000).replace(/\/+$/, "");
  if (!clean) return null;
  const parsed = new URL(clean);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("SECRETARY_SIP_GATEWAY_HTTPS_REQUIRED");
  }
  return parsed.toString().replace(/\/+$/, "");
}

export function secretarySipGatewayReadiness() {
  const gatewayUrl = baseUrl(process.env.AVANTIQO_SECRETARY_SIP_GATEWAY_URL || "");
  const publicBaseUrl = baseUrl(process.env.AVANTIQO_SECRETARY_PUBLIC_BASE_URL || "");
  const gatewayToken = text(process.env.AVANTIQO_SECRETARY_SIP_GATEWAY_TOKEN, 8000);
  const ingressToken = text(process.env.AVANTIQO_SECRETARY_CALL_GATEWAY_TOKEN, 8000);
  const missing = [];
  if (!gatewayUrl) missing.push("AVANTIQO_SECRETARY_SIP_GATEWAY_URL");
  if (!publicBaseUrl) missing.push("AVANTIQO_SECRETARY_PUBLIC_BASE_URL");
  if (!gatewayToken) missing.push("AVANTIQO_SECRETARY_SIP_GATEWAY_TOKEN");
  if (!ingressToken) missing.push("AVANTIQO_SECRETARY_CALL_GATEWAY_TOKEN");
  return {
    ready: missing.length === 0,
    missing,
    gateway_url_configured: Boolean(gatewayUrl),
    public_base_url_configured: Boolean(publicBaseUrl),
    gateway_token_configured: Boolean(gatewayToken),
    ingress_token_configured: Boolean(ingressToken),
    external_authority_used: false,
  };
}

function transportConfig() {
  const readiness = secretarySipGatewayReadiness();
  if (!readiness.ready) {
    const error = new Error(`SECRETARY_SIP_GATEWAY_NOT_CONFIGURED:${readiness.missing.join(",")}`);
    error.code = "SECRETARY_SIP_GATEWAY_NOT_CONFIGURED";
    throw error;
  }
  return {
    gatewayUrl: baseUrl(process.env.AVANTIQO_SECRETARY_SIP_GATEWAY_URL),
    publicBaseUrl: baseUrl(process.env.AVANTIQO_SECRETARY_PUBLIC_BASE_URL),
    gatewayToken: text(process.env.AVANTIQO_SECRETARY_SIP_GATEWAY_TOKEN, 8000),
    ingressToken: text(process.env.AVANTIQO_SECRETARY_CALL_GATEWAY_TOKEN, 8000),
  };
}

export async function claimSecretarySipOutboundCall({ leaseSeconds = 120 } = {}) {
  if (!secretarySipGatewayReadiness().ready) return null;
  const result = await supabaseAdmin.rpc("secretary_claim_outbound_call_request", {
    p_lease_seconds: Math.max(30, Math.min(Number(leaseSeconds) || 120, 600)),
  });
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data[0] || null : result.data || null;
}

async function recordDispatchFailure(request, error) {
  const exhausted = Number(request.attempt_count || 0) >= Number(request.max_attempts || 3);
  const now = Date.now();
  const result = await supabaseAdmin
    .from("secretary_outbound_call_requests")
    .update({
      status: exhausted ? "FAILED" : "CLAIMED",
      last_error: text(error?.message || error || "SIP gateway dispatch failed", 3000),
      lease_expires_at: exhausted ? null : new Date(now + 30_000).toISOString(),
      claim_token: exhausted ? null : request.claim_token,
      metadata: {
        ...object(request.metadata),
        transport: "AVANTIQO_OWNED_SIP_GATEWAY",
        transport_dispatch_failed_at: new Date(now).toISOString(),
        transport_dispatch_exhausted: exhausted,
      },
      updated_at: new Date(now).toISOString(),
    })
    .eq("id", request.id)
    .eq("claim_token", request.claim_token)
    .select("id,status,attempt_count,max_attempts,last_error,lease_expires_at")
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

export async function dispatchSecretarySipOutboundCall(request) {
  if (!request?.id || !request?.claim_token) throw new Error("SECRETARY_SIP_CLAIM_REQUIRED");
  const config = transportConfig();
  const statusUrl = `${config.publicBaseUrl}/api/internal/secretary/calls/outbound/status`;
  const turnUrl = `${config.publicBaseUrl}/api/internal/secretary/calls/turn`;

  try {
    const response = await fetch(`${config.gatewayUrl}/v1/secretary/calls`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.gatewayToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contract: "AVANTIQO_SECRETARY_SIP_GATEWAY_V1",
        request_id: request.id,
        claim_token: request.claim_token,
        phone_line_id: request.phone_line_id,
        destination: request.remote_address,
        language: request.language || null,
        objective: request.objective,
        callbacks: {
          status_url: statusUrl,
          voice_turn_url: turnUrl,
          authorization: `Bearer ${config.ingressToken}`,
        },
        media: {
          input: "audio/wav",
          output: "audio/wav",
          raw_audio_persisted: false,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.accepted === false) {
      throw new Error(`SECRETARY_SIP_GATEWAY_REJECTED:${response.status}:${text(body?.error || body?.message, 1000)}`);
    }

    const now = new Date().toISOString();
    const update = await supabaseAdmin
      .from("secretary_outbound_call_requests")
      .update({
        status: "DIALING",
        last_error: null,
        metadata: {
          ...object(request.metadata),
          transport: "AVANTIQO_OWNED_SIP_GATEWAY",
          transport_contract: "AVANTIQO_SECRETARY_SIP_GATEWAY_V1",
          transport_dispatch_id: text(body?.dispatch_id || body?.call_id, 500) || null,
          transport_dispatched_at: now,
          external_authority_used: false,
        },
        updated_at: now,
      })
      .eq("id", request.id)
      .eq("claim_token", request.claim_token)
      .select("id,status,attempt_count,max_attempts,lease_expires_at,metadata")
      .maybeSingle();
    if (update.error) throw update.error;
    if (!update.data) throw new Error("SECRETARY_SIP_DISPATCH_CLAIM_LOST");
    return { status: "dialing", request: update.data, gateway_acknowledged: true };
  } catch (error) {
    const failed = await recordDispatchFailure(request, error);
    return {
      status: failed?.status === "FAILED" ? "failed" : "retry_scheduled",
      request: failed,
      gateway_acknowledged: false,
      error: text(error?.message || error, 2000),
    };
  }
}

export const SECRETARY_SIP_GATEWAY_TRANSPORT_CONTRACT = Object.freeze({
  authority: "TRANSPORT_ONLY",
  intelligence_owner: "AVANTIQO",
  state_owner: "AVANTIQO",
  gateway_contract: "AVANTIQO_SECRETARY_SIP_GATEWAY_V1",
  raw_audio_persisted: false,
});

export default {
  secretarySipGatewayReadiness,
  claimSecretarySipOutboundCall,
  dispatchSecretarySipOutboundCall,
};
