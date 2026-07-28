export const dynamic = "force-dynamic";

import {
  NextResponse,
} from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  resolveEntity,
} from "@/lib/platform/entities/resolveEntity";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

async function resolveScope(request, body = null) {
  await requireAuth();

  const searchParams = new URL(request.url).searchParams;
  const organizationId =
    body?.organizationId ||
    body?.organization_id ||
    searchParams.get("organizationId") ||
    searchParams.get("organization_id");
  const entityId =
    body?.entityId ||
    body?.entity_id ||
    searchParams.get("entityId") ||
    searchParams.get("entity_id");

  const access = await requireOrganizationAccess({
    organizationId,
    request,
  });

  if (!access.success) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: access.error,
          rows: [],
        },
        {
          status: access.status,
        }
      ),
    };
  }

  if (!entityId) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: "entity_id required",
          rows: [],
        },
        {
          status: 400,
        }
      ),
    };
  }

  const entity = await resolveEntity({
    organizationId: access.organizationId,
    entityId,
  });

  if (!entity) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: "Legal entity not found in organisation",
          rows: [],
        },
        {
          status: 404,
        }
      ),
    };
  }

  return {
    organizationId: access.organizationId,
    entityId: entity.id,
  };
}

async function listCostCenters(request, body = null) {
  try {
    const scope = await resolveScope(request, body);
    if (scope.response) {
      return scope.response;
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("cost_centers")
      .select("*")
      .eq("organization_id", scope.organizationId)
      .eq("entity_id", scope.entityId)
      .order("code", {
        ascending: true,
      });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      organization_id: scope.organizationId,
      entity_id: scope.entityId,
      costCenters: data || [],
      rows: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        rows: [],
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return listCostCenters(request, body);
}

export async function GET(request) {
  return listCostCenters(request);
}
