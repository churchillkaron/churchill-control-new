export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  authorizeSecretaryCallIngress,
  secretaryCallIngressUnauthorized,
} from "@/lib/operator/secretary/SecretaryCallIngressAuth";

export async function POST(request) {
  if (!authorizeSecretaryCallIngress(request)) {
    return secretaryCallIngressUnauthorized();
  }

  try {
    const body = await request.json().catch(() => ({}));
    const leaseSeconds = Math.max(15, Math.min(600, Number(body?.leaseSeconds || body?.lease_seconds || 90)));
    const result = await supabaseAdmin.rpc("secretary_claim_outbound_call_request", {
      p_lease_seconds: leaseSeconds,
    });
    if (result.error) throw result.error;
    const claimed = Array.isArray(result.data) ? result.data[0] : result.data;

    return Response.json(
      {
        success: true,
        claimed: Boolean(claimed?.id),
        request: claimed || null,
        external_authority_used: false,
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    console.error("SECRETARY_OUTBOUND_CALL_CLAIM_FAILED", error?.message || error);
    return Response.json(
      { success: false, error: error?.message || "Outbound call claim failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
