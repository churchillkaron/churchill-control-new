import { NextResponse } from "next/server";
import {
  assertAvantiqoFinalKnowledgeReleaseManagerAuthority,
} from "@/lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseManagerAuthorityRuntime";
import {
  getAvantiqoFinalKnowledgeReleaseActivationReadiness,
} from "@/lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseActivationReadinessRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function uuid(value) {
  const normalized = text(value, 80).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
}

function statusForError(message) {
  if (/AUTHENTICATED_USER_REQUIRED/.test(message)) return 401;
  if (/ORGANIZATION_MANAGER_AUTHORITY_REQUIRED|AUTHORITY_EVIDENCE_MISMATCH/.test(message)) return 403;
  if (/ORGANIZATION_REQUIRED/.test(message)) return 400;
  return 422;
}

export async function GET(request) {
  try {
    const organizationId = uuid(new URL(request.url).searchParams.get("organization_id"));
    if (!organizationId) {
      throw new Error("AVANTIQO_FINAL_KNOWLEDGE_RELEASE_READINESS_ORGANIZATION_REQUIRED");
    }
    const actor = await assertAvantiqoFinalKnowledgeReleaseManagerAuthority(organizationId);
    const readiness = await getAvantiqoFinalKnowledgeReleaseActivationReadiness();
    return NextResponse.json({
      ...readiness,
      authority: {
        contract: actor.contract,
        staff_account_id: actor.staff_account_id,
        role: actor.role,
        authority_function: actor.authority_function,
        authority_verified: actor.authority_verified,
        staff_account_active_verified: actor.staff_account_active_verified,
        organization_membership_active_verified: actor.organization_membership_active_verified,
        manager_role_verified: actor.manager_role_verified,
        caller_supplied_identity_allowed: false,
      },
    }, {
      status: readiness.ready === true ? 200 : 409,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = text(error?.message || error, 1000) || "FINAL_RELEASE_READINESS_FAILED";
    return NextResponse.json({ success: false, error: message }, {
      status: statusForError(message),
      headers: { "cache-control": "no-store" },
    });
  }
}
