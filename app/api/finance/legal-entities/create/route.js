export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  decorateLegalEntity,
  validateLegalEntityWrite,
} from "@/lib/finance/legal-entities/LegalEntityPolicy";

function failure(error) {
  const message = error?.message || "Legal Entity creation failed";
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
    const user = await requireAuth();
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

    const candidate = await validateLegalEntityWrite({
      organizationId: access.organizationId,
      payload: body,
    });

    const { data, error } = await supabaseAdmin
      .from("legal_entities")
      .insert({
        ...candidate,
        organization_id: access.organizationId,
        created_by: user?.id || access.user?.id || null,
        updated_by: user?.id || access.user?.id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
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
