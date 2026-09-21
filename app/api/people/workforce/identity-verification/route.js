export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { createIdentityReviewSignedUrl, loadIdentityVerificationQueue, reviewStaffIdentityDocument } from "@/lib/people/workforce/StaffIdentityVerificationRuntime";

const MANAGE_ROLES = new Set(["OWNER", "ORGANIZATION_OWNER", "ORG_OWNER", "PLATFORM_OWNER", "SUPER_ADMIN", "ADMIN", "MANAGER", "HR_ADMIN"]);
function roleOf(value) { return String(value || "").trim().toUpperCase(); }

async function managementContext(request, organizationId = null) {
  const context = await resolveAuthenticatedStaffContext({ request, organizationId, allowIncompleteActivation: true });
  if (!context.success) return { response: NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 }) };
  const role = roleOf(context.role || context.staff?.role);
  if (!MANAGE_ROLES.has(role)) return { response: NextResponse.json({ success: false, error: "Staff identity verification review permission required", code: "STAFF_IDENTITY_REVIEW_DENIED" }, { status: 403 }) };
  return { organizationId: context.organizationId, manager: context.staff, role };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const context = await managementContext(request, String(url.searchParams.get("organizationId") || "").trim() || null);
    if (context.response) return context.response;
    const documentId = String(url.searchParams.get("documentId") || "").trim();
    if (documentId) {
      const signed = await createIdentityReviewSignedUrl({ organizationId: context.organizationId, documentId });
      return NextResponse.json({ success: true, signed });
    }
    const queue = await loadIdentityVerificationQueue({ organizationId: context.organizationId });
    return NextResponse.json({ success: true, organizationId: context.organizationId, queue });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to load identity verification queue", code: error?.code || null }, { status: error?.status || 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const context = await managementContext(request, String(body.organizationId || body.organization_id || "").trim() || null);
    if (context.response) return context.response;
    const identity = await reviewStaffIdentityDocument({
      organizationId: context.organizationId,
      manager: context.manager,
      documentId: body.documentId || body.document_id,
      decision: body.decision,
      documentNumber: body.documentNumber || body.document_number,
      expiryDate: body.expiryDate || body.expiry_date,
      notes: body.notes,
    });
    return NextResponse.json({ success: true, identity });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to review identity document", code: error?.code || null }, { status: error?.status || 500 });
  }
}
