import { NextResponse } from "next/server";

import {
  archiveTeam,
  createTeam,
  getTeams,
  updateTeam,
} from "@/lib/platform/administration/teams/runtime/TeamRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EDITABLE_FIELDS = [
  "code",
  "name",
  "status",
  "description",
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

    const rows = await getTeams(access.organizationId);
    return NextResponse.json({ success: true, rows });
  } catch (error) {
    return errorResponse(error?.message || "Team lookup failed");
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await accessFor(request, body);
    if (!access.success) return errorResponse(access.error, access.status);

    const row = await createTeam({
      ...editablePayload(body),
      organization_id: access.organizationId,
    });

    return NextResponse.json({ success: true, row });
  } catch (error) {
    return errorResponse(error?.message || "Team creation failed");
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const access = await accessFor(request, body);
    if (!access.success) return errorResponse(access.error, access.status);

    const id = String(body?.id || "").trim();
    if (!id) return errorResponse("team id required", 400);

    const row = await updateTeam(
      id,
      access.organizationId,
      editablePayload(body),
    );

    return NextResponse.json({ success: true, row });
  } catch (error) {
    const status = String(error?.message || "").includes("not found") ? 404 : 500;
    return errorResponse(error?.message || "Team update failed", status);
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const access = await accessFor(request, body);
    if (!access.success) return errorResponse(access.error, access.status);

    const id = String(body?.id || "").trim();
    if (!id) return errorResponse("team id required", 400);

    await archiveTeam(id, access.organizationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const status = String(error?.message || "").includes("not found") ? 404 : 500;
    return errorResponse(error?.message || "Team archive failed", status);
  }
}
