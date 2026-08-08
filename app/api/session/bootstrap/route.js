export const dynamic = "force-dynamic";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getAvailableModules } from "@/lib/platform/getAvailableModules";

async function loadActiveEntity({
  supabase,
  organizationId,
}) {
  if (!organizationId) return null;

  const { data } = await supabase
    .from("legal_entities")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("is_default_accounting_entity", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data || null;
}

async function loadActivePeriod({
  supabase,
  organizationId,
  entityId,
}) {
  if (!organizationId || !entityId) {
    return null;
  }

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

async function loadBootstrapPayload({ request, user }) {
  const context = await resolveAuthenticatedStaffContext({
    request,
    user,
  });

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
  const supabase = createServerSupabase();

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();

  if (orgError || !organization) {
    return {
      response: Response.json(
        {
          success: false,
          reason: "ORGANIZATION_NOT_FOUND",
          error: orgError?.message || null,
        },
        { status: 404 }
      ),
    };
  }

  const [entity, modules] = await Promise.all([
    loadActiveEntity({ supabase, organizationId }),
    getAvailableModules({ organizationId, supabase }),
  ]);

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
      organizations: context.availableOrganizationIds || [],
      organization_id: organizationId,
      active_organization_id: organizationId,
      entity,
      entity_id: entity?.id || null,
      active_entity_id: entity?.id || null,
      period,
      period_id: period?.id || null,
      active_period_id: period?.id || null,
      country: organization.country || entity?.country || null,
      currency: organization.default_currency || entity?.currency || null,
      modules,
      permissions: context.permissions || [],
      role: context.role || context.staff?.role || "staff",
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

  if (result.response) {
    return result.response;
  }

  return Response.json(result.payload);
}

export async function GET(request) {
  try {
    return await handleBootstrap(request);
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message || "Server error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    return await handleBootstrap(request);
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message || "Server error",
      },
      { status: 500 }
    );
  }
}
