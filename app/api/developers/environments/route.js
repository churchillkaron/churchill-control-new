import { NextResponse } from "next/server";
import {
  canManageDeveloperSecurity,
  developerEnvironmentQuotaSummary,
  recordDeveloperSecurityAudit,
  requireDeveloperPortalAccess,
  requireProductionDeveloperAuthority,
} from "@/lib/developer/DeveloperPortalRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function fail(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organization_id") || searchParams.get("organizationId");
  const access = await requireDeveloperPortalAccess({ organizationId, request });
  if (!access.success) return fail(access.error || "Developer access required", access.status || 403);
  const environments = await developerEnvironmentQuotaSummary(access.organizationId, { externalDeveloper: access.externalDeveloper === true, userId: access.user?.id || access.userId || null });
  return NextResponse.json({ success: true, environments });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const access = await requireDeveloperPortalAccess({
    organizationId: body.organization_id || body.organizationId,
    request,
  });
  if (!access.success) return fail(access.error || "Developer access required", access.status || 403);
  if (!canManageDeveloperSecurity(access)) return fail("Developer security authority required to create environments", 403);

  const key = String(body.environment_key || body.key || "").trim().toLowerCase();
  if (!["development", "staging", "production"].includes(key)) {
    return fail("environment_key must be development, staging or production", 400);
  }
  const authority = requireProductionDeveloperAuthority(access, key);
  if (!authority.success) return fail(authority.error, authority.status || 403);

  const existing = await supabaseAdmin
    .from("developer_environments")
    .select("id,status")
    .eq("organization_id", access.organizationId)
    .eq("environment_key", key)
    .maybeSingle();
  if (existing.error) return fail(existing.error.message);
  if (existing.data) {
    return fail("Developer environment already exists; use status control instead", 409);
  }

  if (key === "production" && String(body.confirmation || "").trim() !== "CREATE PRODUCTION") {
    return fail("Type CREATE PRODUCTION to create the Production developer environment", 400);
  }

  const name = String(body.name || key[0].toUpperCase() + key.slice(1)).trim().slice(0, 80);
  const initialStatus = key === "production" ? "DISABLED" : "ACTIVE";
  const result = await supabaseAdmin
    .from("developer_environments")
    .insert({
      organization_id: access.organizationId,
      environment_key: key,
      name,
      status: initialStatus,
      created_by: access.user?.id || null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (result.error) return fail(result.error.message);
  await recordDeveloperSecurityAudit({
    organizationId: access.organizationId,
    actorUserId: access.user?.id || null,
    action: "environment.created",
    targetType: "developer_environment",
    targetId: result.data.id,
    metadata: { environment_key: key, status: initialStatus },
  });
  return NextResponse.json({ success: true, environment: result.data }, { status: 201 });
}

export async function PATCH(request) {
  const body = await request.json().catch(() => ({}));
  const access = await requireDeveloperPortalAccess({
    organizationId: body.organization_id || body.organizationId,
    request,
  });
  if (!access.success) return fail(access.error || "Developer access required", access.status || 403);
  if (!canManageDeveloperSecurity(access)) return fail("Developer security authority required to change environments", 403);

  const id = String(body.id || "").trim();
  const action = String(body.action || "status").trim().toLowerCase();
  const status = String(body.status || "").trim().toUpperCase();
  if (!id) return fail("environment id required", 400);
  if (!["status", "policy"].includes(action)) return fail("Unsupported environment action", 400);
  if (action === "status" && !["ACTIVE", "DISABLED"].includes(status)) return fail("status must be ACTIVE or DISABLED", 400);

  const current = await supabaseAdmin
    .from("developer_environments")
    .select("id,environment_key,status,requests_per_minute,monthly_request_limit,max_active_credentials,max_active_webhooks")
    .eq("id", id)
    .eq("organization_id", access.organizationId)
    .maybeSingle();
  if (current.error) return fail(current.error.message);
  if (!current.data) return fail("Environment not found", 404);

  const authority = requireProductionDeveloperAuthority(access, current.data.environment_key);
  if (!authority.success) return fail(authority.error, authority.status || 403);

  if (action === "policy") {
    if (!canManageDeveloperSecurity(access)) {
      return fail("Developer security authority required to change environment policy", 403);
    }
    const requestsPerMinute = Number(body.requests_per_minute);
    const monthlyRequestLimit = body.monthly_request_limit === null || body.monthly_request_limit === "" || body.monthly_request_limit === undefined
      ? null
      : Number(body.monthly_request_limit);
    const maxActiveCredentials = Number(body.max_active_credentials);
    const maxActiveWebhooks = Number(body.max_active_webhooks);

    if (!Number.isInteger(requestsPerMinute) || requestsPerMinute < 1 || requestsPerMinute > 10000) {
      return fail("requests_per_minute must be between 1 and 10000", 400);
    }
    if (monthlyRequestLimit !== null && (!Number.isInteger(monthlyRequestLimit) || monthlyRequestLimit < 0)) {
      return fail("monthly_request_limit must be null or a non-negative integer", 400);
    }
    if (!Number.isInteger(maxActiveCredentials) || maxActiveCredentials < 1 || maxActiveCredentials > 1000) {
      return fail("max_active_credentials must be between 1 and 1000", 400);
    }
    if (!Number.isInteger(maxActiveWebhooks) || maxActiveWebhooks < 0 || maxActiveWebhooks > 1000) {
      return fail("max_active_webhooks must be between 0 and 1000", 400);
    }

    const updated = await supabaseAdmin
      .from("developer_environments")
      .update({
        requests_per_minute: requestsPerMinute,
        monthly_request_limit: monthlyRequestLimit,
        max_active_credentials: maxActiveCredentials,
        max_active_webhooks: maxActiveWebhooks,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organization_id", access.organizationId)
      .select("*")
      .single();
    if (updated.error) return fail(updated.error.message);

    await recordDeveloperSecurityAudit({
      organizationId: access.organizationId,
      actorUserId: access.user?.id || null,
      action: "environment.policy_updated",
      targetType: "developer_environment",
      targetId: id,
      metadata: {
        environment_key: current.data.environment_key,
        requests_per_minute: requestsPerMinute,
        monthly_request_limit: monthlyRequestLimit,
        max_active_credentials: maxActiveCredentials,
        max_active_webhooks: maxActiveWebhooks,
      },
    });
    return NextResponse.json({ success: true, environment: updated.data });
  }

  if (
    action === "status" &&
    current.data.environment_key === "production" &&
    status === "ACTIVE" &&
    String(body.confirmation || "").trim() !== "ENABLE PRODUCTION"
  ) {
    return fail("Type ENABLE PRODUCTION to activate the Production developer environment", 400);
  }

  let reactivationImpact = { active_credentials: 0, active_webhooks: 0 };
  if (
    action === "status" &&
    current.data.environment_key === "production" &&
    status === "ACTIVE" &&
    current.data.status !== "ACTIVE"
  ) {
    const now = new Date().toISOString();
    const [credentials, webhooks] = await Promise.all([
      supabaseAdmin
        .from("developer_api_credentials")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", access.organizationId)
        .eq("environment_id", id)
        .eq("status", "ACTIVE")
        .is("revoked_at", null)
        .gt("expires_at", now),
      supabaseAdmin
        .from("developer_webhook_endpoints")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", access.organizationId)
        .eq("environment_id", id)
        .eq("status", "ACTIVE"),
    ]);
    if (credentials.error) return fail(credentials.error.message);
    if (webhooks.error) return fail(webhooks.error.message);

    reactivationImpact = {
      active_credentials: Number(credentials.count || 0),
      active_webhooks: Number(webhooks.count || 0),
    };
    if (
      (reactivationImpact.active_credentials > 0 || reactivationImpact.active_webhooks > 0) &&
      body.acknowledge_reactivation !== true
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Production reactivation would restore existing integrations; explicit acknowledgement required",
          reactivation_impact: reactivationImpact,
        },
        { status: 409 },
      );
    }
  }

  const result = await supabaseAdmin
    .from("developer_environments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", access.organizationId)
    .select("*")
    .single();
  if (result.error) return fail(result.error.message);

  await recordDeveloperSecurityAudit({
    organizationId: access.organizationId,
    actorUserId: access.user?.id || null,
    action: status === "DISABLED" ? "environment.disabled" : "environment.enabled",
    targetType: "developer_environment",
    targetId: id,
    metadata: {
      environment_key: current.data.environment_key,
      previous_status: current.data.status,
      status,
      ...(status === "ACTIVE" && current.data.environment_key === "production"
        ? { reactivation_impact: reactivationImpact }
        : {}),
    },
  });
  return NextResponse.json({ success: true, environment: result.data });
}
