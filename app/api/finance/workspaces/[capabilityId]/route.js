export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { getFinanceWorkspaceContract } from "@/lib/finance/workspaces/FinanceWorkspaceContracts";

const MISSING_RELATION_CODES = new Set([
  "42P01",
  "PGRST204",
  "PGRST205",
]);

function queryValue(searchParams, camel, snake) {
  return searchParams.get(camel) || searchParams.get(snake) || null;
}

function isMissingRelation(error) {
  return MISSING_RELATION_CODES.has(String(error?.code || ""));
}

async function readTable({
  table,
  contract,
  organizationId,
  entityId,
}) {
  let query = supabaseAdmin
    .from(table)
    .select("*")
    .eq("organization_id", organizationId)
    .limit(250);

  if (contract.scope === "entity") {
    query = query.eq("entity_id", entityId);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingRelation(error)) {
      return null;
    }

    throw new Error(
      `Unable to load ${table}: ${error.message}`
    );
  }

  return Array.isArray(data) ? data : [];
}

export async function GET(request, { params }) {
  try {
    const capabilityId = String(params?.capabilityId || "").trim();
    const contract = getFinanceWorkspaceContract(capabilityId);

    if (!contract) {
      return NextResponse.json(
        { success: false, error: "Unknown Finance workspace" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedOrganizationId = queryValue(
      searchParams,
      "organizationId",
      "organization_id"
    );
    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, rows: [] },
        { status: access.status }
      );
    }

    let entityId = queryValue(
      searchParams,
      "entityId",
      "entity_id"
    );

    if (contract.scope === "entity") {
      if (!entityId) {
        return NextResponse.json(
          {
            success: false,
            error: "entity_id required for this Finance workspace",
            rows: [],
          },
          { status: 400 }
        );
      }

      const entity = await resolveEntity({
        organizationId: access.organizationId,
        entityId,
      });

      if (!entity) {
        return NextResponse.json(
          {
            success: false,
            error: "Legal entity not found in organisation",
            rows: [],
          },
          { status: 404 }
        );
      }

      entityId = entity.id;
    }

    let rows = [];
    let sourceTable = null;

    for (const table of contract.tables) {
      const result = await readTable({
        table,
        contract,
        organizationId: access.organizationId,
        entityId,
      });

      if (result !== null) {
        rows = result;
        sourceTable = table;
        break;
      }
    }

    return NextResponse.json({
      success: true,
      capabilityId,
      organization_id: access.organizationId,
      entity_id: entityId,
      scope: contract.scope,
      sourceTable,
      rows,
      unavailable: sourceTable === null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Finance workspace load failed",
        rows: [],
      },
      { status: 500 }
    );
  }
}
