export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { createControlledDocument, requestDocumentApproval } from "@/lib/documents/runtime/DocumentControlRuntime";
import { loadEmploymentAssignmentsForPeriod } from "@/lib/people/employees/employmentAssignmentService";
import {
  STAFF_IDENTITY_DOCUMENT_TYPES,
  loadStaffIdentityDocumentStatus,
} from "@/lib/people/identity/staffIdentityDocumentRuntime";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  localDateString,
  resolveOrganizationTimeContext,
} from "@/lib/shared/time/organizationTime";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const TYPE_MAP = Object.freeze({
  passport: STAFF_IDENTITY_DOCUMENT_TYPES.passport,
  national_id: STAFF_IDENTITY_DOCUMENT_TYPES.national_id,
  work_permit: STAFF_IDENTITY_DOCUMENT_TYPES.work_permit,
});

function clean(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

function validDate(value) {
  const text = clean(value, 32);
  return !text || /^\d{4}-\d{2}-\d{2}$/.test(text);
}

async function currentEmployment({ organizationId, staff }) {
  const timeContext = await resolveOrganizationTimeContext({ organizationId });
  const businessDate = localDateString(new Date(), timeContext.timezone);
  const assignments = await loadEmploymentAssignmentsForPeriod({
    organizationId,
    staffId: staff.id,
    startDate: businessDate,
    endDate: businessDate,
  });
  const current = (assignments || []).find((assignment) =>
    assignment.staff_account_id === staff.id &&
    assignment.party_id === staff.party_id &&
    assignment.effective_from <= businessDate &&
    (!assignment.effective_to || assignment.effective_to >= businessDate)
  ) || null;
  return { current, businessDate, timezone: timeContext.timezone };
}

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 },
      );
    }

    const employment = await currentEmployment({
      organizationId: context.organizationId,
      staff: context.staff,
    });

    const documents = await loadStaffIdentityDocumentStatus({
      organizationId: context.organizationId,
      staffId: context.staff.id,
      currentEntityId: employment.current?.entity_id || null,
    });

    return NextResponse.json({
      success: true,
      security: {
        email: context.user?.email || context.staff?.email || null,
        email_verified: Boolean(context.user?.email_confirmed_at),
        email_verified_at: context.user?.email_confirmed_at || null,
        phone: context.user?.phone || null,
        phone_verified: Boolean(context.user?.phone_confirmed_at),
        phone_verified_at: context.user?.phone_confirmed_at || null,
        auth_user_id: context.user?.id || null,
        staff_id: context.staff.id,
        party_id: context.staff.party_id || null,
        organization_id: context.organizationId,
        legal_entity_id: employment.current?.entity_id || null,
      },
      documents,
      business_date: employment.businessDate,
      timezone: employment.timezone,
    });
  } catch (error) {
    console.error("STAFF_IDENTITY_DOCUMENTS_GET_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load identity documents" },
      { status: error?.status || 500 },
    );
  }
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 },
      );
    }

    const key = clean(form.get("document_type"), 40).toLowerCase();
    const documentType = TYPE_MAP[key];
    if (!documentType) {
      return NextResponse.json(
        { success: false, error: "document_type must be passport, national_id or work_permit" },
        { status: 400 },
      );
    }

    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ success: false, error: "Document file required" }, { status: 400 });
    }
    if (Number(file.size || 0) <= 0) {
      return NextResponse.json({ success: false, error: "Document file is empty" }, { status: 400 });
    }
    if (Number(file.size || 0) > MAX_FILE_BYTES) {
      return NextResponse.json({ success: false, error: "Document file exceeds 20 MB" }, { status: 413 });
    }

    const effectiveDate = clean(form.get("effective_date"), 32) || null;
    const expiryDate = clean(form.get("expiry_date"), 32) || null;
    const documentNumber = clean(form.get("document_number"), 160) || null;
    if (!validDate(effectiveDate) || !validDate(expiryDate)) {
      return NextResponse.json({ success: false, error: "Document dates must use YYYY-MM-DD" }, { status: 400 });
    }
    if ((key === "passport" || key === "work_permit") && !expiryDate) {
      return NextResponse.json(
        { success: false, error: "Passport and work permit require an expiry date" },
        { status: 400 },
      );
    }

    const employment = await currentEmployment({
      organizationId: context.organizationId,
      staff: context.staff,
    });

    const entityId = key === "work_permit"
      ? employment.current?.entity_id || null
      : null;

    if (key === "work_permit" && !entityId) {
      return NextResponse.json(
        { success: false, error: "Current legal-entity employment is required before uploading a work permit" },
        { status: 409 },
      );
    }

    const labels = {
      passport: "Passport",
      national_id: "National ID",
      work_permit: "Work permit",
    };

    const created = await createControlledDocument({
      organizationId: context.organizationId,
      entityId,
      actor: { staffId: context.staff.id },
      file,
      documentName: `${labels[key]} · ${context.staff.name || context.staff.id}`,
      documentType,
      documentNumber,
      classification: "RESTRICTED",
      ownerStaffId: context.staff.id,
      effectiveDate,
      expiryDate,
      referenceType: "staff_accounts",
      referenceId: context.staff.id,
      tags: ["staff-identity", key, "private"],
      metadata: {
        staff_identity_document: true,
        staff_id: context.staff.id,
        party_id: context.staff.party_id || null,
        legal_entity_id: entityId,
        uploaded_from: "staff_portal",
        verification_state: "PENDING",
      },
    });

    const documentId = created?.id || created?.document_id || null;
    if (documentId) {
      await requestDocumentApproval({
        organizationId: context.organizationId,
        documentId,
        actor: { staffId: context.staff.id },
      });
    }

    const documents = await loadStaffIdentityDocumentStatus({
      organizationId: context.organizationId,
      staffId: context.staff.id,
      currentEntityId: employment.current?.entity_id || null,
    });

    return NextResponse.json({
      success: true,
      document_id: documentId,
      verification: "PENDING",
      documents,
    });
  } catch (error) {
    console.error("STAFF_IDENTITY_DOCUMENTS_POST_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to upload identity document" },
      { status: error?.status || 500 },
    );
  }
}
