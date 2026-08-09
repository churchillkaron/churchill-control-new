import { NextResponse } from "next/server";

import {
  archiveBusinessLocation,
  createBusinessLocation,
  getBusinessLocations,
  updateBusinessLocation,
} from "@/lib/platform/administration/business-locations/runtime/BusinessLocationRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EDITABLE_FIELDS = [
  "code",
  "name",
  "location_type",
  "business_unit_id",
  "department_id",
  "status",
  "address",
  "city",
  "province",
  "postal_code",
  "country",
  "timezone",
  "currency_code",
  "phone",
  "email",
  "description",
  "is_default",
  "metadata",
];

function requestedOrganizationId(request, body = null) {
  const bodyId = body?.organizationId || body?.organization_id || null;
  if (bodyId) return bodyId;

  const url = new URL(request.url);
  return url.searchParams.get("organizationId") || url.searchParams.get("organization_id") || null;
}

function editablePayload(body = {}) {
  return Object.fromEntries(
    EDITABLE_FIELDS
      .filter((field) => body[field] !== undefined)
      .map((field) => [field, body[field]]),
  );
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

async function accessFor(request, body = null) {
  return requireOrganizationAccess({
    organizationId: requestedOrganizationId(request, body),
    request,
  });
}

export async function GET(request) {
  try {
    const access = await accessFor(request);
    if (!access.success) return errorResponse(access.error, access.status);

    const rows = await getBusinessLocations(access.organizationId);
    return NextResponse.json({ success: true, rows });
  } catch (error) {
    return errorResponse(error?.message || "Business location lookup failed");
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await accessFor(request, body);
    if (!access.success) return errorResponse(access.error, access.status);

    const row = await createBusinessLocation({
      ...editablePayload(body),
      organization_id: access.organizationId,
    });

    return NextResponse.json({ success: true, row });
  } catch (error) {
    return errorResponse(error?.message || "Business location creation failed");
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const access = await accessFor(request, body);
    if (!access.success) return errorResponse(access.error, access.status);

    const id = String(body?.id || "").trim();
    if (!id) return errorResponse("business location id required", 400);

    const row = await updateBusinessLocation(
      id,
      access.organizationId,
      editablePayload(body),
    );

    return NextResponse.json({ success: true, row });
  } catch (error) {
    const status = String(error?.message || "").includes("not found") ? 404 : 500;
    return errorResponse(error?.message || "Business location update failed", status);
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const access = await accessFor(request, body);
    if (!access.success) return errorResponse(access.error, access.status);

    const id = String(body?.id || "").trim();
    if (!id) return errorResponse("business location id required", 400);

    await archiveBusinessLocation(id, access.organizationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const status = String(error?.message || "").includes("not found") ? 404 : 500;
    return errorResponse(error?.message || "Business location archive failed", status);
  }
}
