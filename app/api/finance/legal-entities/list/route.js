export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { decorateLegalEntity } from "@/lib/finance/legal-entities/LegalEntityPolicy";

async function loadEntities({ organizationId }) {
  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("*")
    .eq("organization_id", organizationId)
    .order("is_default_accounting_entity", { ascending: false })
    .order("is_active", { ascending: false })
    .order("legal_name", { ascending: true });

  if (error) throw error;
  return (data || []).map(decorateLegalEntity);
}

function failure(error) {
  return NextResponse.json(
    {
      success: false,
      error: error?.message || "Legal Entities load failed",
      entities: [],
      rows: [],
    },
    { status: 500 }
  );
}

export async function GET(request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, entities: [], rows: [] },
        { status: access.status }
      );
    }

    const entities = await loadEntities({ organizationId: access.organizationId });

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      count: entities.length,
      entities,
      rows: entities,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request) {
  try {
    await requireAuth();
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, entities: [], rows: [] },
        { status: access.status }
      );
    }

    const entities = await loadEntities({ organizationId: access.organizationId });

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      count: entities.length,
      entities,
      rows: entities,
    });
  } catch (error) {
    return failure(error);
  }
}
