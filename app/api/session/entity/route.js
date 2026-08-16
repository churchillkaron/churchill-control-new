export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_ENTITY_COOKIE = "avantiqo_active_entity_id";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const entityId = String(body?.entityId || body?.entity_id || "").trim();

    if (!entityId) {
      return NextResponse.json(
        { success: false, error: "entityId required" },
        { status: 400 }
      );
    }

    const context = await resolveAuthenticatedStaffContext({ request });

    if (!context.success) {
      return NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
        },
        { status: context.status || 403 }
      );
    }

    const { data: entity, error } = await supabaseAdmin
      .from("legal_entities")
      .select(
        "id,organization_id,legal_name,display_name,code,country,currency,is_active,is_default_accounting_entity"
      )
      .eq("id", entityId)
      .eq("organization_id", context.organizationId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;

    if (!entity) {
      return NextResponse.json(
        { success: false, error: "Legal entity is not active in this organization" },
        { status: 404 }
      );
    }

    const response = NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      organization_id: context.organizationId,
      entity,
      entityId: entity.id,
      entity_id: entity.id,
      active_entity_id: entity.id,
    });

    response.cookies.set(ACTIVE_ENTITY_COOKIE, entity.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    console.error("SESSION_ENTITY_SELECTION_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to select legal entity",
      },
      { status: 500 }
    );
  }
}
