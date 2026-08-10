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

    const { data, error } = await supabaseAdmin
      .from("hotel_guests")
      .insert({
        organization_id: access.organizationId,
        full_name: fullName,
        email: cleanValue(body.email),
        phone: cleanValue(body.phone),
        nationality: cleanValue(body.nationality),
        document_type: documentType,
        document_number: documentNumber,
        notes: cleanValue(body.notes),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, guest: data });
  } catch (error) {
    console.error("HOTEL_GUEST_CREATE_ERROR", error);
    return errorResponse(error?.message || "Guest creation failed");
  }
}
