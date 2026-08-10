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

    if (!organizationId) {
      return errorResponse("organizationId required", 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const name = cleanValue(body.name);
    if (!name) {
      return errorResponse("Property name required", 400);
    }

    const { data, error } = await supabaseAdmin
      .from("hotel_properties")
      .insert({
        organization_id: access.organizationId,
        name,
        address: cleanValue(body.address),
        city: cleanValue(body.city),
        country: cleanValue(body.country),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      property: data,
    });
  } catch (error) {
    console.error("HOTEL_PROPERTY_CREATE_ERROR", error);
    return errorResponse(error?.message || "Property creation failed");
  }
}
