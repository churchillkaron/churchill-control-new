export const dynamic = "force-dynamic";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { getAvailableModules } from "@/lib/platform/getAvailableModules";
import { resolvePlatformOperatorOrganizationId } from "@/lib/platform/security/PlatformOperatorWorkspaceRuntime";
import { evaluateOrganizationAppAccess } from "@/lib/platform/security/organizationAccessPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createServerSupabase } from "@/lib/shared/supabase/server";

const ACTIVE_ENTITY_COOKIE = "avantiqo_active_entity_id";

async function loadEntities({ organizationId }) {
  if (!organizationId) return [];

  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("is_default_accounting_entity", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

function resolveActiveEntity({ entities, requestedEntityId }) {
  const rows = Array.isArray(entities) ? entities : [];
  const requested = String(requestedEntityId || "").trim();

  if (requested) {
    const selected = rows.find((row) => String(row?.id || "") === requested);
    if (selected) return selected;
  }

  return (
    rows.find((row) => row?.is_default_accounting_entity === true) ||
    rows[0] ||
    null
  );
}

async function loadActivePeriod({ supabase, organizationId, entityId }) {
  if (!organizationId || !entityId) return null;

  const { data } = await supabase
    .from("accounting_periods")
    .select("*")
    .eq("organization_id", organizationId)
    .or(`entity_id.eq.${entityId},entity_id.is.null`)
    .in("status", ["OPEN", "open"])
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
}

function bearerToken(request) {
  const value = request?.headers?.get?.("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function loadAuthenticatedUser(request) {
  const token = bearerToken(request);

  if (token) {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    return { user: data?.user || null, error };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      user: null,
      error: new Error("Supabase browser authentication is not configured"),
    };
  }

  const cookieStore = cookies();
  const authClient = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Bootstrap only reads the authenticated session.
      },
    },
  });

  const { data, error } = await authClient.auth.getUser();
  return { user: data?.user || null, error };
}

async function loadOrganizations(organizationIds) {
  const ids = Array.isArray(organizationIds)
    ? [...new Set(organizationIds.filter(Boolean))]
    : [];

  if (!ids.length) return [];

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .in("id", ids)
    .limit(1000);

  if (error) throw error;

  return (data || [])
    .filter((row) => {
      const status = String(row.organization_status || row.status || "")
        .trim()
        .toUpperCase();
      return !["INACTIVE", "DISABLED", "SUSPENDED", "ARCHIVED"].includes(status);
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

async function loadBootstrapPayload({ request, user }) {
  const context = await resolveAuthenticatedStaffContext({ request, user });

  if (!context.success) {
    return {
      response: Response.json(
        {
          success: false,
          reason: context.code,
          error: context.error,
          availableOrganizationIds: context.availableOrganizationIds || [],
        },
        { status: context.status || 403 }
      ),
    };
  }

  const organizationId = context.organizationId;
  const accessPolicy = await evaluateOrganizationAppAccess({
    organizationId,
    role: context.role || context.staff?.role,
  });

  if (!accessPolicy.allowed) {
    return {
      response: Response.json(
        {
          success: false,
          reason: accessPolicy.code,
          error: accessPolicy.reason,
          organization_id: organizationId,
          active_organization_id: organizationId,
        },
        { status: 403 }
      ),
    };
  }

  const supabase = createServerSupabase();

  const [organizations, entities, modules, operatorOrganizationId] = await Promise.all([
    loadOrganizations(context.availableOrganizationIds || [organizationId]),
    loadEntities({ organizationId }),
    getAvailableModules({ organizationId, supabase }),
    resolvePlatformOperatorOrganizationId().catch(() => null),
  ]);

  const organization =
    organizations.find((row) => row.id === organizationId) || null;

  if (!organization) {
    return {
      response: Response.json(
        {
          success: false,
          reason: "ORGANIZATION_NOT_FOUND",
          error: "Active organization is not available to this user",
        },
        { status: 404 }
      ),
    };
  }

  const cookieStore = cookies();
  const entity = resolveActiveEntity({
    entities,
    requestedEntityId: cookieStore.get(ACTIVE_ENTITY_COOKIE)?.value || null,
  });

  const period = await loadActivePeriod({
    supabase,
    organizationId,
    entityId: entity?.id || null,
  });

  return {
    payload: {
      success: true,
      staff: context.staff,
      organization,
      organizations,
      organization_id: organizationId,
      active_organization_id: organizationId,
      is_platform_operator_workspace: Boolean(
        operatorOrganizationId && organizationId === operatorOrganizationId,
      ),
      entity,
      entities,
      entity_id: entity?.id || null,
      active_entity_id: entity?.id || null,
      period,
      period_id: period?.id || null,
      active_period_id: period?.id || null,
      country: entity?.country || organization.country || null,
      currency: entity?.currency || organization.default_currency || null,
      modules,
      permissions: context.permissions || [],
      role: context.role || context.staff?.role || "staff",
      access_policy: accessPolicy.policy.access,
    },
  };
}

async function handleBootstrap(request) {
  const { user, error } = await loadAuthenticatedUser(request);

  if (error || !user) {
    return Response.json(
      {
        success: false,
        reason: "AUTHENTICATION_REQUIRED",
        error: error?.message || null,
      },
      { status: 401 }
    );
  }

  const result = await loadBootstrapPayload({ request, user });
  if (result.response) return result.response;

  return Response.json(result.payload);
}

export async function GET(request) {
  try {
    return await handleBootstrap(request);
  } catch (error) {
    return Response.json(
      { success: false, error: error.message || "Server error" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    return await handleBootstrap(request);
  } catch (error) {
    return Response.json(
      { success: false, error: error.message || "Server error" },
      { status: 500 }
    );
  }
}
