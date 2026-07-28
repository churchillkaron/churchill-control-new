export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, events: [], rows: [] },
        { status: access.status }
      );
    }

    const requestedEntityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      null;

    let entityId = null;
    if (requestedEntityId) {
      const entity = await resolveEntity({
        organizationId: access.organizationId,
        entityId: requestedEntityId,
      });

      if (!entity) {
        return NextResponse.json(
          {
            success: false,
            error: "Legal entity not found in organisation",
            events: [],
            rows: [],
          },
          { status: 400 }
        );
      }

      entityId = entity.id;
    }

    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") || 200), 1),
      500
    );

    let query = supabaseAdmin
      .from("audit_logs")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    const action = String(searchParams.get("action") || "").trim();
    if (action) {
      query = query.eq("action", action);
    }

    const entityType = String(
      searchParams.get("entityType") || searchParams.get("entity_type") || ""
    ).trim();
    if (entityType) {
      query = query.eq("entity_type", entityType);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = entityId
      ? (data || []).filter(event =>
          String(event?.metadata?.legal_entity_id || "") === String(entityId) ||
          String(event?.metadata?.entity_id || "") === String(entityId)
        )
      : (data || []);

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entityId,
      events: rows,
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Audit trail load failed" },
      { status: 500 }
    );
  }
}
