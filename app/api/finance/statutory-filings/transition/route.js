export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { transitionStatutoryFiling } from "@/lib/finance/statutory-filings/transitionStatutoryFiling";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
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

    const entityId = required(body.entityId || body.entity_id, "entity_id");
    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId,
    });

    if (!entity) {
      throw new Error("Legal entity not found in organisation");
    }

    const result = await transitionStatutoryFiling({
      organizationId: access.organizationId,
      entityId: entity.id,
      filingId: body.filingId || body.filing_id || body.id,
      status: body.status || body.target_status,
      submissionReference:
        body.submissionReference || body.submission_reference || null,
      reason: body.reason || body.notes || null,
      actor: access.user?.id || null,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Statutory filing transition failed";
    const status = /required|not found|invalid|cannot|transition/i.test(message)
      ? 400
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
