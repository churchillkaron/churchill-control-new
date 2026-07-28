export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  decorateLegalEntity,
  validateLegalEntityWrite,
} from "@/lib/finance/legal-entities/LegalEntityPolicy";

function failure(error) {
  const message = error?.message || "Legal Entity update failed";
  const status = /required|must|valid|configured|already exists|not found|cannot/i.test(
    message
  )
    ? 400
    : 500;

  return NextResponse.json(
    { success: false, error: message },
    { status }
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const entityId = String(body.id || body.entity_id || "").trim();
    if (!entityId) {
      return NextResponse.json(
        { success: false, error: "Legal Entity id required" },
        { status: 400 }
      );
    }

    const candidate = await validateLegalEntityWrite({
      organizationId: access.organizationId,
      payload: body,
      recordId: entityId,
    });

    const { data, error } = await supabaseAdmin
      .from("legal_entities")
      .update({
        ...candidate,
        updated_by: access.user?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", access.organizationId)
      .eq("id", entityId)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      entity: decorateLegalEntity(data),
      record: decorateLegalEntity(data),
    });
  } catch (error) {
    return failure(error);
  }
}
