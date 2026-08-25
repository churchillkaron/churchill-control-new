import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  listManagedSecretaryTelephony,
  requestManagedSecretaryNumber,
} from "@/lib/operator/secretary/SecretaryManagedTelephonyRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clean(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit) || null;
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

function statusForError(message) {
  if (message.includes("required") || message.includes("REQUIRED")) return 400;
  if (message.includes("INSUFFICIENT_WALLET_BALANCE")) return 402;
  if (message.includes("PRICING_NOT_CONFIGURED") || message.includes("CONFIG_MISSING")) return 503;
  if (message.includes("NO_LONGER_AVAILABLE")) return 409;
  return 500;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = clean(searchParams.get("organization_id") || searchParams.get("organizationId"), 120);
    if (!organizationId) return errorResponse("organization_id required", 400);

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status);

    const result = await listManagedSecretaryTelephony({ organizationId: access.organizationId });
    return NextResponse.json({ success: true, organization_id: access.organizationId, ...result });
  } catch (error) {
    console.error("SECRETARY_TELEPHONY_CONNECTION_LIST_FAILED", error?.message || error);
    return errorResponse(error?.message || "Secretary telephony lookup failed");
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body?.organization_id || body?.organizationId, 120);
    if (!organizationId) return errorResponse("organization_id required", 400);

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status);

    const result = await requestManagedSecretaryNumber({
      organizationId: access.organizationId,
      countryCode: body?.country_code || body?.countryCode,
      phoneNumber: body?.phone_number || body?.phoneNumber,
      numberType: body?.number_type || body?.numberType || "local",
      locality: body?.locality || null,
      idempotencyKey: body?.idempotency_key || body?.idempotencyKey,
      displayName: body?.display_name || body?.displayName || null,
      defaultLanguage: body?.default_language || body?.defaultLanguage || null,
      timezone: body?.timezone || "UTC",
    });

    return NextResponse.json(
      {
        success: true,
        organization_id: access.organizationId,
        ...result,
      },
      { status: result.status === "reused" ? 200 : 202 },
    );
  } catch (error) {
    const message = error?.message || "Secretary telephony provisioning failed";
    console.error("SECRETARY_TELEPHONY_CONNECTION_CREATE_FAILED", message);
    return errorResponse(message, statusForError(message));
  }
}
