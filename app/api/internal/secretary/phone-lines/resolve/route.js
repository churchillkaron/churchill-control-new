export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  authorizeSecretaryCallIngress,
  secretaryCallIngressUnauthorized,
} from "@/lib/operator/secretary/SecretaryCallIngressAuth";

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function normalizeCalledNumber(value) {
  let result = text(value, 160);
  if (!result) return null;
  result = result.replace(/^sip:/i, "").split("@")[0].trim();
  return result || null;
}

export async function POST(request) {
  if (!authorizeSecretaryCallIngress(request)) {
    return secretaryCallIngressUnauthorized();
  }

  try {
    const body = await request.json();
    const calledNumber = normalizeCalledNumber(
      body?.calledNumber || body?.called_number || body?.did || body?.destination,
    );
    if (!calledNumber) {
      return Response.json(
        { success: false, error: "calledNumber required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await supabaseAdmin
      .from("secretary_phone_lines")
      .select("id,organization_id,line_address,default_language,timezone,inbound_enabled,outbound_enabled")
      .eq("line_address", calledNumber)
      .eq("active", true)
      .eq("inbound_enabled", true)
      .limit(2);
    if (result.error) throw result.error;
    if (!result.data?.length) {
      return Response.json(
        { success: false, error: "SECRETARY_DID_NOT_ASSIGNED" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (result.data.length > 1) {
      return Response.json(
        { success: false, error: "SECRETARY_DID_ASSIGNMENT_AMBIGUOUS" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const line = result.data[0];
    return Response.json(
      {
        success: true,
        phone_line_id: line.id,
        organization_id: line.organization_id,
        called_number: line.line_address,
        default_language: line.default_language || null,
        timezone: line.timezone || null,
        inbound_enabled: line.inbound_enabled === true,
        outbound_enabled: line.outbound_enabled === true,
        secretary_authority: "AVANTIQO",
        external_authority_used: false,
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    console.error("SECRETARY_PHONE_LINE_RESOLVE_FAILED", error?.message || error);
    return Response.json(
      { success: false, error: error?.message || "Secretary phone-line resolution failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
