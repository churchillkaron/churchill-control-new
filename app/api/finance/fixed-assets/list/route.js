export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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
        { success: false, error: access.error, assets: [], rows: [] },
        { status: access.status }
      );
    }

    const requestedEntityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id");

    if (!requestedEntityId) {
      return NextResponse.json(
        { success: false, error: "entity_id required", assets: [], rows: [] },
        { status: 400 }
      );
    }

    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId: requestedEntityId,
    });

    if (!entity) {
      return NextResponse.json(
        { success: false, error: "Legal entity not found in organisation", assets: [], rows: [] },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("fixed_assets")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entity.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const assets = (data || []).map(asset => ({
      ...asset,
      calculated_book_value: Math.max(
        0,
        Number(asset.purchase_cost || 0) -
          Number(asset.accumulated_depreciation || 0)
      ),
    }));

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entity.id,
      assets,
      rows: assets,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Fixed Assets load failed", assets: [], rows: [] },
      { status: 500 }
    );
  }
}
