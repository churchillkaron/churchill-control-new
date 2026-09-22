import { NextResponse } from "next/server";

import { canManageDeveloperSecurity, requireDeveloperPortalAccess } from "@/lib/developer/DeveloperPortalRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function fail(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

function safeLimit(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(10, Math.min(100, parsed)) : 25;
}

function safeCursor(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeSearch(value) {
  return String(value || "").trim().slice(0, 80).replace(/[,%()]/g, " ");
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organization_id") || searchParams.get("organizationId");
  const access = await requireDeveloperPortalAccess({ organizationId, request });
  if (!access.success) return fail(access.error || "Developer access required", access.status || 403);

  const canSeeOrganizationSecurity = canManageDeveloperSecurity(access);
  let ownedCredentialIds = null;
  if (!canSeeOrganizationSecurity) {
    const ownedCredentials = await supabaseAdmin
      .from("developer_api_credentials")
      .select("id")
      .eq("organization_id", access.organizationId)
      .eq("created_by", access.user?.id || "00000000-0000-0000-0000-000000000000");
    if (ownedCredentials.error) return fail(ownedCredentials.error.message);
    ownedCredentialIds = (ownedCredentials.data || []).map((row) => row.id);
  }

  const limit = safeLimit(searchParams.get("limit"));
  const requestBefore = safeCursor(searchParams.get("request_before"));
  const securityBefore = safeCursor(searchParams.get("security_before"));
  const environmentId = String(searchParams.get("environment_id") || "").trim();
  const status = String(searchParams.get("status") || "all").trim().toLowerCase();
  const q = safeSearch(searchParams.get("q"));
  const requestId = String(searchParams.get("request_id") || "").trim().slice(0, 120);

  let requests = supabaseAdmin
    .from("developer_api_requests")
    .select("request_id,capability_id,method,command,status_code,latency_ms,error_code,idempotency_key,created_at,environment_id,credential_id")
    .eq("organization_id", access.organizationId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (!canSeeOrganizationSecurity) requests = ownedCredentialIds.length
    ? requests.in("credential_id", ownedCredentialIds)
    : requests.eq("credential_id", "00000000-0000-0000-0000-000000000000");
  if (requestBefore) requests = requests.lt("created_at", requestBefore);
  if (requestId) requests = requests.eq("request_id", requestId);
  if (environmentId) requests = requests.eq("environment_id", environmentId);
  if (status === "success") requests = requests.lt("status_code", 400);
  if (status === "failed") requests = requests.gte("status_code", 400);
  if (q) {
    requests = requests.or(
      `capability_id.ilike.%${q}%,command.ilike.%${q}%,error_code.ilike.%${q}%`,
    );
  }

  let security = supabaseAdmin
    .from("developer_security_audit_events")
    .select("id,actor_user_id,action,target_type,target_id,metadata,created_at")
    .eq("organization_id", access.organizationId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (!canSeeOrganizationSecurity) security = security.eq("actor_user_id", access.user?.id || "00000000-0000-0000-0000-000000000000");
  if (securityBefore) security = security.lt("created_at", securityBefore);
  if (q) {
    security = security.or(`action.ilike.%${q}%,target_type.ilike.%${q}%`);
  }

  const [requestResult, securityResult, environments, credentials] = await Promise.all([
    requests,
    security,
    supabaseAdmin
      .from("developer_environments")
      .select("id,environment_key,name,status")
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: true }),
    (() => {
      let query = supabaseAdmin
        .from("developer_api_credentials")
        .select("id,name,token_prefix,token_last_four,status,expires_at,revoked_at,created_by")
        .eq("organization_id", access.organizationId);
      if (!canSeeOrganizationSecurity) query = query.eq("created_by", access.user?.id || "00000000-0000-0000-0000-000000000000");
      return query;
    })(),
  ]);

  if (requestResult.error) return fail(requestResult.error.message);
  if (securityResult.error) return fail(securityResult.error.message);
  if (environments.error) return fail(environments.error.message);
  if (credentials.error) return fail(credentials.error.message);

  const environmentById = new Map((environments.data || []).map((row) => [row.id, row]));
  const credentialById = new Map((credentials.data || []).map((row) => [row.id, row]));
  const requestRows = (requestResult.data || []).map((row) => ({
    ...row,
    environment: environmentById.get(row.environment_id) || null,
    credential: credentialById.get(row.credential_id) || null,
  }));
  const securityRows = securityResult.data || [];
  const requestPage = requestRows.slice(0, limit);
  const securityPage = securityRows.slice(0, limit);

  return NextResponse.json({
    success: true,
    requests: requestPage,
    security: securityPage,
    environments: environments.data || [],
    pagination: {
      requests_has_more: requestRows.length > limit,
      security_has_more: securityRows.length > limit,
      request_before: requestRows.length > limit ? requestPage.at(-1)?.created_at || null : null,
      security_before: securityRows.length > limit ? securityPage.at(-1)?.created_at || null : null,
    },
  });
}
