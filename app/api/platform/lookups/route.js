import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  getLookupOptions,
} from "@/lib/platform/erp-engine/lookups/LookupRuntime";

import {
  resolveEntity,
} from "@/lib/platform/entities/resolveEntity";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const CREATABLE_LOOKUPS = new Set([
  "items",
  "cost_centers",
  "departments",
  "projects",
]);

function accessError(access) {
  return NextResponse.json(
    {
      success: false,
      error: access.error,
    },
    {
      status: access.status,
    }
  );
}

function cleanValue(value) {
  const normalized = String(value ?? "").trim();

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return null;
  }

  return normalized;
}

function cleanName(value) {
  const normalized = cleanValue(value);
  if (!normalized) return null;
  return normalized.slice(0, 180);
}

function cleanCode(value) {
  const normalized = cleanValue(value);
  if (!normalized) return null;
  const code = normalized
    .toUpperCase()
    .replace(/[^A-Z0-9._/-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return code || null;
}

function generatedCode(prefix, name) {
  const stem = String(name || "NEW")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16) || "NEW";
  const suffix = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `${prefix}-${stem}-${suffix}`.slice(0, 32);
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function resolveScopedEntity({ organizationId, requestedEntityId }) {
  if (!requestedEntityId) return null;

  const entity = await resolveEntity({
    organizationId,
    entityId: requestedEntityId,
  });

  return entity || null;
}

function optionFor(lookup, row) {
  return {
    value: String(row.id),
    label: row.name || row.code || row.id,
    description:
      lookup === "items"
        ? [row.code, row.sale_price !== null && row.sale_price !== undefined
            ? `Price ${Number(row.sale_price).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`
            : null]
            .filter(Boolean)
            .join(" · ")
        : row.code || row.description || "",
    raw: row,
  };
}

async function findExisting({ lookup, organizationId, entityId, name }) {
  const table =
    lookup === "items"
      ? "inventory_items"
      : lookup;

  let query = supabaseAdmin
    .from(table)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("name", name)
    .limit(1);

  if (entityId) {
    query = query.eq("entity_id", entityId);
  } else if (lookup !== "items") {
    query = query.is("entity_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function createLookupRecord({
  lookup,
  organizationId,
  entityId,
  name,
  code,
  body,
}) {
  const existing = await findExisting({
    lookup,
    organizationId,
    entityId,
    name,
  });

  if (existing) return existing;

  let table;
  let record;

  if (lookup === "items") {
    table = "inventory_items";
    record = {
      organization_id: organizationId,
      entity_id: entityId,
      name,
      code: cleanCode(code) || generatedCode("SVC", name),
      type: "SERVICE",
      sale_price: Math.max(0, numeric(body.salePrice ?? body.sale_price ?? body.unit_price, 0)),
      cost: 0,
      is_active: true,
    };
  } else if (lookup === "cost_centers") {
    table = "cost_centers";
    record = {
      organization_id: organizationId,
      entity_id: entityId,
      name,
      code: cleanCode(code) || generatedCode("CC", name),
      type: "SERVICE",
      description: cleanValue(body.description),
      is_active: true,
    };
  } else if (lookup === "departments") {
    table = "departments";
    record = {
      organization_id: organizationId,
      entity_id: entityId,
      name,
      code: cleanCode(code) || generatedCode("DEP", name),
      description: cleanValue(body.description),
      status: "ACTIVE",
      is_active: true,
    };
  } else if (lookup === "projects") {
    table = "projects";
    record = {
      organization_id: organizationId,
      entity_id: entityId,
      name,
      code: cleanCode(code) || generatedCode("PRJ", name),
      description: cleanValue(body.description),
      status: "ACTIVE",
    };
  } else {
    throw new Error("Lookup is not creatable");
  }

  const { data, error } = await supabaseAdmin
    .from(table)
    .insert(record)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const requestedOrganizationId = cleanValue(
      searchParams.get("organizationId") ||
      searchParams.get("organization_id")
    );

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return accessError(access);
    }

    const lookup = String(
      searchParams.get("lookup") || ""
    ).trim();

    if (!lookup) {
      return NextResponse.json(
        {
          success: false,
          error: "lookup required",
        },
        {
          status: 400,
        }
      );
    }

    const requestedEntityId = cleanValue(
      searchParams.get("entityId") ||
      searchParams.get("entity_id")
    );

    let entityId = null;

    if (requestedEntityId) {
      const entity = await resolveScopedEntity({
        organizationId: access.organizationId,
        requestedEntityId,
      });

      if (!entity) {
        return NextResponse.json(
          {
            success: false,
            error: "Entity does not belong to organization",
          },
          {
            status: 403,
          }
        );
      }

      entityId = entity.id;
    }

    const options = await getLookupOptions({
      lookup,
      query: searchParams.get("query") || "",
      context: {
        organizationId: access.organizationId,
        entityId,
      },
    });

    return NextResponse.json(options || []);
  } catch (error) {
    console.error("LOOKUP API ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Lookup failed",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId = cleanValue(
      body.organizationId || body.organization_id
    );

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) return accessError(access);

    const lookup = String(body.lookup || "").trim();
    if (!CREATABLE_LOOKUPS.has(lookup)) {
      return NextResponse.json(
        { success: false, error: "Lookup cannot be created from this form" },
        { status: 400 }
      );
    }

    const name = cleanName(body.name || body.label);
    if (!name) {
      return NextResponse.json(
        { success: false, error: "Name required" },
        { status: 400 }
      );
    }

    const requestedEntityId = cleanValue(body.entityId || body.entity_id);
    const entity = await resolveScopedEntity({
      organizationId: access.organizationId,
      requestedEntityId,
    });

    if (requestedEntityId && !entity) {
      return NextResponse.json(
        { success: false, error: "Entity does not belong to organization" },
        { status: 403 }
      );
    }

    if (lookup !== "items" && !entity) {
      return NextResponse.json(
        { success: false, error: "Legal entity required for this master record" },
        { status: 400 }
      );
    }

    const row = await createLookupRecord({
      lookup,
      organizationId: access.organizationId,
      entityId: entity?.id || null,
      name,
      code: body.code,
      body,
    });

    return NextResponse.json({
      success: true,
      option: optionFor(lookup, row),
    });
  } catch (error) {
    console.error("LOOKUP CREATE API ERROR", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Lookup creation failed",
      },
      { status: 500 }
    );
  }
}
