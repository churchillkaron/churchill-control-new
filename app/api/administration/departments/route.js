import { NextResponse } from "next/server";

import {
  archiveDepartment,
  createDepartment,
  getDepartments,
  updateDepartment,
} from "@/lib/platform/administration/departments/runtime/DepartmentRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EDITABLE_FIELDS = [
  "name",
  "entity_id",
  "code",
  "status",
  "description",
  "is_active",
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

    const entityId = new URL(request.url).searchParams.get("entityId") ||
      new URL(request.url).searchParams.get("entity_id") ||
      null;

    const rows = await getDepartments({
      organizationId: access.organizationId,
      entityId,
    });

    return NextResponse.json({ success: true, rows });
  } catch (error) {
    return errorResponse(error?.message || "Department lookup failed");
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await accessFor(request, body);
    if (!access.success) return errorResponse(access.error, access.status);

    const row = await createDepartment({
      ...editablePayload(body),
      organization_id: access.organizationId,
    });

    return NextResponse.json({ success: true, row });
  } catch (error) {
    return errorResponse(error?.message || "Department creation failed");
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const access = await accessFor(request, body);
    if (!access.success) return errorResponse(access.error, access.status);

    const id = String(body?.id || "").trim();
    if (!id) return errorResponse("department id required", 400);

    const row = await updateDepartment(
      id,
      access.organizationId,
      editablePayload(body),
    );

    return NextResponse.json({ success: true, row });
  } catch (error) {
    const status = String(error?.message || "").includes("not found") ? 404 : 500;
    return errorResponse(error?.message || "Department update failed", status);
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const access = await accessFor(request, body);
    if (!access.success) return errorResponse(access.error, access.status);

    const id = String(body?.id || "").trim();
    if (!id) return errorResponse("department id required", 400);

    await archiveDepartment(id, access.organizationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const status = String(error?.message || "").includes("not found") ? 404 : 500;
    return errorResponse(error?.message || "Department archive failed", status);
  }
}
