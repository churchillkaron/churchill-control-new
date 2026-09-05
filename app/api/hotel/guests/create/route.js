import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function cleanValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = cleanValue(
      body.organizationId || body.organization_id,
    );

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status);

    const fullName = cleanValue(
      body.fullName ||
      body.full_name ||
      [body.firstName, body.lastName].filter(Boolean).join(" "),
    );

    if (!fullName) return errorResponse("Guest name required", 400);

    const documentNumber = cleanValue(
      body.documentNumber || body.document_number || body.passportNumber,
    );
    const documentType = cleanValue(
      body.documentType || body.document_type ||
      (body.passportNumber ? "PASSPORT" : null),
    );

    const { data, error } = await supabaseAdmin.rpc(
      "hotel_create_guest_with_party",
      {
        p_organization_id: access.organizationId,
        p_full_name: fullName,
        p_email: cleanValue(body.email),
        p_phone: cleanValue(body.phone),
        p_nationality: cleanValue(body.nationality),
        p_document_type: documentType,
        p_document_number: documentNumber,
        p_notes: cleanValue(body.notes),
      },
    );

    if (error) throw error;

    return NextResponse.json({ success: true, guest: data });
  } catch (error) {
    console.error("HOTEL_GUEST_CREATE_ERROR", error);
    return errorResponse(error?.message || "Guest creation failed");
  }
}
