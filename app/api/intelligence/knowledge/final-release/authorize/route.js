import { NextResponse } from "next/server";
import { issueAvantiqoFinalKnowledgeReleaseAuthorization } from "@/lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseAuthorizationIssuerRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function statusForError(message) {
  if (/AUTHENTICATED_USER_REQUIRED/.test(message)) return 401;
  if (/ORGANIZATION_MANAGER_AUTHORITY_REQUIRED|AUTHORITY_EVIDENCE_MISMATCH/.test(message)) return 403;
  if (/ORGANIZATION_REQUIRED|HYPOTHESIS_FINGERPRINT_REQUIRED|APPROVAL_REASON_REQUIRED/.test(message)) return 400;
  if (/NOT_FOUND/.test(message)) return 404;
  if (/ALREADY_EXISTS/.test(message)) return 409;
  return 422;
}

export async function POST(request) {
  try {
    const contentType = text(request.headers.get("content-type"), 120).toLowerCase();
    if (!contentType.includes("application/json")) {
      return NextResponse.json({
        success: false,
        error: "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_JSON_REQUIRED",
      }, { status: 415 });
    }
    const body = await request.json();
    const result = await issueAvantiqoFinalKnowledgeReleaseAuthorization({
      organization_id: body?.organization_id,
      hypothesis_fingerprint: body?.hypothesis_fingerprint,
      approval_reason: body?.approval_reason,
      expires_in_minutes: body?.expires_in_minutes,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = text(error?.message || error, 1000) || "FINAL_RELEASE_AUTHORIZATION_FAILED";
    return NextResponse.json({ success: false, error: message }, { status: statusForError(message) });
  }
}
