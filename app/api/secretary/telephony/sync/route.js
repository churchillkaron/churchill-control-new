import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { syncManagedSecretaryNumber } from "@/lib/operator/secretary/SecretaryManagedTelephonyRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clean(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit) || null;
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body?.organization_id || body?.organizationId, 120);
    const connectionId = clean(body?.connection_id || body?.connectionId, 120);
    if (!organizationId) return errorResponse("organization_id required", 400);
    if (!connectionId) return errorResponse("connection_id required", 400);

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status);

    const result = await syncManagedSecretaryNumber({
      organizationId: access.organizationId,
      connectionId,
    });
    return NextResponse.json({ success: true, organization_id: access.organizationId, ...result });
  } catch (error) {
    const message = error?.message || "Secretary telephony sync failed";
    console.error("SECRETARY_TELEPHONY_SYNC_FAILED", message);
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("CONFIG_MISSING") ? 503 : 500;
    return errorResponse(message, status);
  }
}
