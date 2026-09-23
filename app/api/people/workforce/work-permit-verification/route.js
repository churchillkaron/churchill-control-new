export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  createWorkPermitReviewSignedUrl,
  loadWorkPermitReviewQueue,
  reviewStaffWorkPermit,
} from "@/lib/people/workforce/StaffWorkPermitRuntime";

const MANAGE_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "HR_ADMIN",
]);

function roleOf(value) {
  return String(value || "").trim().toUpperCase();
}

async function managementContext(request, organizationId = null) {
  const context = await resolveAuthenticatedStaffContext({
    request,
    organizationId,
    allowIncompleteActivation: true,
  });
  if (!context.success) {
    return {
      response: NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 },
      ),
    };
  }

  const role = roleOf(context.role || context.staff?.role);
  if (!MANAGE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: "Staff work-permit review permission required",
          code: "STAFF_WORK_PERMIT_REVIEW_DENIED",
        },
        { status: 403 },
      ),
    };
  }

  return {
    organizationId: context.organizationId,
    manager: context.staff,
    role,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const context = await managementContext(
      request,
      String(url.searchParams.get("organizationId") || "").trim() || null,
    );
    if (context.response) return context.response;

    const documentId = String(url.searchParams.get("documentId") || "").trim();
    if (documentId) {
      const signed = await createWorkPermitReviewSignedUrl({
        organizationId: context.organizationId,
        documentId,
      });
      return NextResponse.json({ success: true, signed });
    }

    const queue = await loadWorkPermitReviewQueue({
      organizationId: context.organizationId,
    });
    return NextResponse.json({ success: true, queue });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load work-permit review queue",
        code: error?.code || null,
      },
      { status: error?.status || 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const context = await managementContext(
      request,
      String(body.organizationId || body.organization_id || "").trim() || null,
    );
    if (context.response) return context.response;

    const review = await reviewStaffWorkPermit({
      organizationId: context.organizationId,
      manager: context.manager,
      documentId: body.documentId || body.document_id,
      decision: body.decision,
      notes: body.notes,
    });

    return NextResponse.json({ success: true, review });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to review work permit",
        code: error?.code || null,
      },
      { status: error?.status || 500 },
    );
  }
}
