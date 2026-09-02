export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { loadDocumentCommandCenter } from "@/lib/documents/runtime/DocumentLibraryRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function clean(value) {
  return String(value ?? "").trim();
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
    );
    const entityId = clean(
      url.searchParams.get("entityId") || url.searchParams.get("entity_id"),
    );
    const periodId = clean(
      url.searchParams.get("periodId") || url.searchParams.get("period_id"),
    );

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: entityId || null,
      periodId: periodId || null,
      request,
      access,
    });
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 400 },
      );
    }

    const data = await loadDocumentCommandCenter({
      organizationId: context.organizationId,
      entityId: context.entityId || null,
    });

    return NextResponse.json({
      success: true,
      ready: true,
      context: {
        organization_id: context.organizationId,
        entity_id: context.entityId || null,
        period_id: context.periodId || null,
        entity_name:
          context.entity?.display_name ||
          context.entity?.legal_name ||
          context.entity?.name ||
          null,
      },
      ...data,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("DOCUMENTS_COMMAND_CENTER_FAILED", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load Documents" },
      { status: error?.status || 500 },
    );
  }
}
