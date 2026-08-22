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
  if (/required|not found|scope|calculated|submitted|reference/i.test(normalized)) return 400;
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
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    await requireFinanceWorkspacePermission({
      capabilityId: "vat_returns",
      operation: "write",
      access,
    });

    const actorId = required(access.user?.id, "authenticated user");
    const entityId = required(body.entityId || body.entity_id, "entity_id");
    const vatReturnId = required(
      body.vat_return_id || body.vatReturnId || body.record_id || body.id,
      "vat_return_id"
    );
    const submissionReference = required(
      body.submission_reference || body.submissionReference,
      "submission_reference"
    );

    const { data, error } = await supabaseAdmin.rpc("mark_finance_vat_return_submitted", {
      p_organization_id: access.organizationId,
      p_entity_id: entityId,
      p_vat_return_id: vatReturnId,
      p_submission_reference: submissionReference,
      p_submitted_by: actorId,
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error?.message || "VAT submission evidence update failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
