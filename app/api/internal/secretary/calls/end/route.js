export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  authorizeSecretaryCallIngress,
  secretaryCallIngressUnauthorized,
} from "@/lib/operator/secretary/SecretaryCallIngressAuth";
import { endSecretaryCall } from "@/lib/operator/secretary/SecretaryCallerRuntime";

function text(value, limit = 5000) {
  return String(value ?? "").trim().slice(0, limit);
}

export async function POST(request) {
  if (!authorizeSecretaryCallIngress(request)) {
    return secretaryCallIngressUnauthorized();
  }

  try {
    const body = await request.json();
    const callId = text(body?.callId || body?.call_id, 120);
    const status = text(body?.status, 40).toUpperCase() || "COMPLETED";
    const summary = text(body?.summary, 5000) || null;

    if (!callId) {
      return Response.json(
        { success: false, error: "callId required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await endSecretaryCall({ callId, status, summary });
    return Response.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    console.error("SECRETARY_CALL_END_INGRESS_FAILED", error?.message || error);
    return Response.json(
      { success: false, error: error?.message || "Secretary call end failed" },
      { status: error?.status || 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
