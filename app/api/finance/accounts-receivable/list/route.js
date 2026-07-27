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
        { success: false, error: access.error, receivables: [], rows: [] },
        { status: access.status }
      );
    }

    const requestedEntityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id");

    if (!requestedEntityId) {
      return NextResponse.json(
        { success: false, error: "entity_id required", receivables: [], rows: [] },
        { status: 400 }
      );
    }

    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId: requestedEntityId,
    });

    if (!entity) {
      return NextResponse.json(
        { success: false, error: "Legal entity not found in organisation", receivables: [], rows: [] },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("accounts_receivable")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entity.id)
      .order("due_date", { ascending: true });

    if (error) throw error;

    const receivables = data || [];

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entity.id,
      receivables,
      rows: receivables,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Accounts receivable list failed",
        receivables: [],
        rows: [],
      },
      { status: 500 }
    );
  }
}
