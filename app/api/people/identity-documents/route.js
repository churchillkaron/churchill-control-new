export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  createDocumentSignedUrl,
  decideDocumentApproval,
} from "@/lib/documents/runtime/DocumentControlRuntime";
import {
  STAFF_IDENTITY_DOCUMENT_TYPES,
  loadStaffIdentityDocumentStatus,
} from "@/lib/people/identity/staffIdentityDocumentRuntime";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "HR_ADMIN",
]);

const ALLOWED_TYPES = new Set(Object.values(STAFF_IDENTITY_DOCUMENT_TYPES));

function clean(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

function normalizeRole(value) {
  return clean(value, 80).toUpperCase();
}

async function managementContext(request) {
  const context = await resolveAuthenticatedStaffContext({ request });
  if (!context.success) {
    return {
      response: NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 },
      ),
    };
  }

  if (!MANAGE_ROLES.has(normalizeRole(context.role || context.staff?.role))) {
    return {
      response: NextResponse.json(
        { success: false, error: "People identity review permission required" },
        { status: 403 },
      ),
    };
  }

  return {
    organizationId: context.organizationId,
    actorStaffId: context.staff?.id || null,
    role: normalizeRole(context.role || context.staff?.role),
  };
}

async function loadTargetStaff({ organizationId, staffId }) {
  const staff = await supabaseAdmin
    .from("staff_accounts")
    .select("id,name,email,role,position,department,party_id,active,active_organization_id")
    .eq("id", staffId)
    .eq("active_organization_id", organizationId)
    .maybeSingle();
  if (staff.error) throw staff.error;
  if (!staff.data) {
    const error = new Error("Employee not found in this organization");
    error.status = 404;
    throw error;
  }

  const employment = await supabaseAdmin
    .from("employee_employment_assignments")
    .select("id,entity_id,effective_from,effective_to,status")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .is("effective_to", null)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (employment.error) throw employment.error;

  return {
    staff: staff.data,
    employment: employment.data || null,
  };
}

async function assertIdentityDocument({ organizationId, staffId, documentId }) {
  const result = await supabaseAdmin
    .from("enterprise_documents")
    .select("id,organization_id,entity_id,document_type,document_name,document_number,document_status,classification,owner_staff_id,effective_date,expiry_date,version_number,mime_type,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .eq("owner_staff_id", staffId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data || !ALLOWED_TYPES.has(result.data.document_type)) {
    const error = new Error("Staff identity document not found");
    error.status = 404;
    throw error;
  }
  return result.data;
}

async function reviewPayload({ organizationId, staffId }) {
  const target = await loadTargetStaff({ organizationId, staffId });
  const documents = await loadStaffIdentityDocumentStatus({
    organizationId,
    staffId,
    currentEntityId: target.employment?.entity_id || null,
  });
  return {
    staff: target.staff,
    employment: target.employment,
    documents,
  };
}

export async function GET(request) {
  try {
    const ctx = await managementContext(request);
    if (ctx.response) return ctx.response;

    const url = new URL(request.url);
    const staffId = clean(url.searchParams.get("staffId") || url.searchParams.get("staff_id"), 160);
    const documentId = clean(url.searchParams.get("documentId") || url.searchParams.get("document_id"), 160);
    const action = clean(url.searchParams.get("action"), 40).toLowerCase();

    if (!staffId) {
      return NextResponse.json({ success: false, error: "staffId required" }, { status: 400 });
    }

    if (action === "preview") {
      if (!documentId) {
        return NextResponse.json({ success: false, error: "documentId required" }, { status: 400 });
      }

      const document = await assertIdentityDocument({
        organizationId: ctx.organizationId,
        staffId,
        documentId,
      });

      const signed = await createDocumentSignedUrl({
        organizationId: ctx.organizationId,
        documentId,
        expiresIn: 300,
      });

      await supabaseAdmin.from("enterprise_document_access_logs").insert({
        organization_id: ctx.organizationId,
        enterprise_document_id: documentId,
        accessed_by: ctx.actorStaffId,
        access_type: "IDENTITY_PREVIEW",
        metadata: {
          staff_id: staffId,
          document_type: document.document_type,
          reviewer_role: ctx.role,
          expires_in: signed.expires_in,
        },
        accessed_at: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        preview: {
          url: signed.url,
          expires_in: signed.expires_in,
          version_number: signed.version_number,
          document,
        },
      });
    }

    return NextResponse.json({
      success: true,
      ...(await reviewPayload({
        organizationId: ctx.organizationId,
        staffId,
      })),
    });
  } catch (error) {
    console.error("PEOPLE_IDENTITY_DOCUMENTS_GET_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load identity review" },
      { status: error?.status || 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const ctx = await managementContext(request);
    if (ctx.response) return ctx.response;

    const body = await request.json().catch(() => ({}));
    const staffId = clean(body.staffId || body.staff_id, 160);
    const documentId = clean(body.documentId || body.document_id, 160);
    const decision = clean(body.decision, 20).toUpperCase();
    const notes = clean(body.notes, 1000) || null;

    if (!staffId || !documentId) {
      return NextResponse.json(
        { success: false, error: "staffId and documentId required" },
        { status: 400 },
      );
    }
    if (!["APPROVE", "REJECT"].includes(decision)) {
      return NextResponse.json(
        { success: false, error: "decision must be APPROVE or REJECT" },
        { status: 400 },
      );
    }

    await assertIdentityDocument({
      organizationId: ctx.organizationId,
      staffId,
      documentId,
    });

    const decided = await decideDocumentApproval({
      organizationId: ctx.organizationId,
      documentId,
      actor: { staffId: ctx.actorStaffId },
      decision,
      notes,
    });

    return NextResponse.json({
      success: true,
      decision,
      approval: decided,
      ...(await reviewPayload({
        organizationId: ctx.organizationId,
        staffId,
      })),
    });
  } catch (error) {
    console.error("PEOPLE_IDENTITY_DOCUMENTS_PATCH_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to decide identity document" },
      { status: error?.status || 500 },
    );
  }
}
