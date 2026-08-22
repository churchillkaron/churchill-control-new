export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function statusFor(message) {
  const normalized = String(message || "");
  if (/permission denied|authentication|membership/i.test(normalized)) return 403;
  if (/required|not found|already submitted|scope|status/i.test(normalized)) return 400;
  return 500;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await requireFinanceWorkspacePermission({
      capabilityId: "statutory_filings",
      operation: "write",
      access,
    });

    const actorId = required(access.user?.id, "authenticated user");
    const entityId = required(body.entityId || body.entity_id, "entity_id");
    const filingId = required(
      body.filing_id || body.filingId || body.id || body.record_id,
      "filing_id"
    );
    const submissionReference = required(
      body.submission_reference || body.submissionReference,
      "submission_reference"
    );

    const { data, error } = await supabaseAdmin.rpc(
      "mark_finance_statutory_filing_submitted",
      {
        p_organization_id: access.organizationId,
        p_entity_id: entityId,
        p_filing_id: filingId,
        p_submission_reference: submissionReference,
        p_submitted_by: actorId,
      }
    );

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      filing: data,
      submission_mode: "EXTERNAL_REFERENCE_RECORDED",
    });
  } catch (error) {
    const message = error?.message || "Unable to record statutory filing submission";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
