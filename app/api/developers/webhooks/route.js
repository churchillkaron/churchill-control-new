import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  canManageDeveloperWebhooks,
  developerWebhookEventCatalog,
  recordDeveloperSecurityAudit,
  requireDeveloperPortalAccess,
  requireProductionDeveloperAuthority,
  validateDeveloperWebhookEventTypes,
} from "@/lib/developer/DeveloperPortalRuntime";
import { assertPublicWebhookUrl } from "@/lib/developer/DeveloperWebhookRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function fail(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}
function databaseFailure(error) {
  const message = String(error?.message || error || "Database operation failed");
  if (message.includes("DEVELOPER_ACTIVE_CREDENTIAL_LIMIT_REACHED")) {
    return fail("Active credential limit reached for this environment", 409);
  }
  if (message.includes("DEVELOPER_ACTIVE_WEBHOOK_LIMIT_REACHED")) {
    return fail("Active webhook limit reached for this environment", 409);
  }
  return fail(message);
}


export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organization_id") || searchParams.get("organizationId");
  const access = await requireDeveloperPortalAccess({ organizationId, request });
  if (!access.success) return fail(access.error || "Developer access required", access.status || 403);
  if (!canManageDeveloperWebhooks(access)) return fail("Developer webhook management authority required", 403);
  const endpoints = await supabaseAdmin
    .from("developer_webhook_endpoints")
    .select("id,organization_id,environment_id,name,url,event_types,status,created_at,updated_at")
    .eq("organization_id", access.organizationId)
    .order("created_at", { ascending: false });
  if (endpoints.error) return fail(endpoints.error.message);
  const deliveries = await supabaseAdmin
    .from("developer_webhook_deliveries")
    .select("id,endpoint_id,event_id,event_type,status,attempt,response_status,error,next_attempt_at,created_at,delivered_at,replay_of_delivery_id,replay_key")
    .eq("organization_id", access.organizationId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (deliveries.error) return fail(deliveries.error.message);
  const projections = await supabaseAdmin
    .from("developer_operations_webhook_projections")
    .select("operations_event_id,status,attempt,next_attempt_at,last_error,created_at,updated_at,projected_at")
    .eq("organization_id", access.organizationId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (projections.error) return fail(projections.error.message);

  const projectionRows = projections.data || [];
  return NextResponse.json({
    success: true,
    endpoints: endpoints.data || [],
    deliveries: deliveries.data || [],
    event_catalog: developerWebhookEventCatalog(),
    projection_health: {
      total: projectionRows.length,
      processing: projectionRows.filter((row) => row.status === "PROCESSING").length,
      failed: projectionRows.filter((row) => row.status === "FAILED").length,
      dead_letter: projectionRows.filter((row) => row.status === "DEAD_LETTER").length,
      recent: projectionRows,
    },
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const access = await requireDeveloperPortalAccess({
    organizationId: body.organization_id || body.organizationId,
    request,
  });
  if (!access.success) return fail(access.error || "Developer access required", access.status || 403);
  if (!canManageDeveloperWebhooks(access)) return fail("Developer webhook management authority required", 403);

  const environmentId = String(body.environment_id || "").trim();
  if (!environmentId) return fail("environment_id required", 400);
  const environment = await supabaseAdmin
    .from("developer_environments")
    .select("id,environment_key,status")
    .eq("id", environmentId)
    .eq("organization_id", access.organizationId)
    .maybeSingle();
  if (environment.error) return fail(environment.error.message);
  if (!environment.data || environment.data.status !== "ACTIVE") return fail("Active developer environment required", 400);

  const authority = requireProductionDeveloperAuthority(access, environment.data.environment_key);
  if (!authority.success) return fail(authority.error, authority.status || 403);

  const url = String(body.url || "").trim();
  try {
    await assertPublicWebhookUrl(url);
  } catch (error) {
    return fail(error?.message || "Webhook destination is not allowed", 400);
  }

  const name = String(body.name || "Webhook endpoint").trim().slice(0, 120);
  const validatedEvents = validateDeveloperWebhookEventTypes({
    environmentKey: environment.data.environment_key,
    eventTypes: body.event_types,
  });
  if (!validatedEvents.success) {
    return NextResponse.json(
      {
        success: false,
        error: validatedEvents.error,
        invalid_event_types: validatedEvents.invalid_event_types || [],
      },
      { status: validatedEvents.status || 400 },
    );
  }
  const eventTypes = validatedEvents.event_types;

  const inserted = await supabaseAdmin
    .from("developer_webhook_endpoints")
    .insert({
      organization_id: access.organizationId,
      environment_id: environmentId,
      name,
      url,
      event_types: eventTypes,
      status: "ACTIVE",
      created_by: access.user?.id || null,
    })
    .select("id,environment_id,name,url,event_types,status,created_at")
    .single();
  if (inserted.error) return databaseFailure(inserted.error);

  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  const provisioned = await supabaseAdmin.rpc("provision_developer_webhook_secret", {
    p_organization_id: access.organizationId,
    p_endpoint_id: inserted.data.id,
    p_secret: secret,
  });
  if (provisioned.error) {
    await supabaseAdmin.from("developer_webhook_endpoints").delete().eq("id", inserted.data.id);
    return fail(provisioned.error.message);
  }
  await recordDeveloperSecurityAudit({
    organizationId: access.organizationId,
    actorUserId: access.user?.id || null,
    action: "webhook.created",
    targetType: "developer_webhook_endpoint",
    targetId: inserted.data.id,
    metadata: {
      environment_id: environmentId,
      environment_key: environment.data.environment_key,
      event_types: eventTypes,
      host: new URL(url).hostname,
    },
  });
  return NextResponse.json({
    success: true,
    endpoint: inserted.data,
    signing_secret: secret,
    warning: "Copy this signing secret now. It is protected in Vault and is not returned again.",
  }, { status: 201 });
}

export async function PATCH(request) {
  const body = await request.json().catch(() => ({}));
  const access = await requireDeveloperPortalAccess({
    organizationId: body.organization_id || body.organizationId,
    request,
  });
  if (!access.success) return fail(access.error || "Developer access required", access.status || 403);
  if (!canManageDeveloperWebhooks(access)) return fail("Developer webhook management authority required", 403);
  const id = String(body.id || "").trim();
  const action = String(body.action || "status").trim().toLowerCase();
  const status = String(body.status || "DISABLED").trim().toUpperCase();
  if (!id) return fail("Webhook endpoint id required", 400);
  if (action === "status" && !["ACTIVE", "DISABLED"].includes(status)) return fail("Invalid webhook status", 400);
  if (!["status", "rotate_secret", "subscriptions", "endpoint"].includes(action)) return fail("Unsupported webhook action", 400);

  const current = await supabaseAdmin
    .from("developer_webhook_endpoints")
    .select("id,environment_id,name,url,status,event_types,developer_environments(environment_key)")
    .eq("id", id)
    .eq("organization_id", access.organizationId)
    .maybeSingle();
  if (current.error) return fail(current.error.message);
  if (!current.data) return fail("Webhook endpoint not found", 404);
  const env = Array.isArray(current.data.developer_environments)
    ? current.data.developer_environments[0]
    : current.data.developer_environments;
  const authority = requireProductionDeveloperAuthority(access, env?.environment_key);
  if (!authority.success) return fail(authority.error, authority.status || 403);

  if (action === "endpoint") {
    const nextName = String(body.name || current.data.name || "Webhook endpoint").trim().slice(0, 120);
    const requestedUrl = String(body.url || current.data.url || "").trim();
    let nextUrl;
    try {
      nextUrl = await assertPublicWebhookUrl(requestedUrl);
    } catch (error) {
      return fail(error?.message || "Webhook destination is not allowed", 400);
    }

    const updated = await supabaseAdmin
      .from("developer_webhook_endpoints")
      .update({
        name: nextName,
        url: nextUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organization_id", access.organizationId)
      .select("id,name,url,event_types,status,updated_at")
      .maybeSingle();
    if (updated.error) return databaseFailure(updated.error);

    await recordDeveloperSecurityAudit({
      organizationId: access.organizationId,
      actorUserId: access.user?.id || null,
      action: "webhook.endpoint_updated",
      targetType: "developer_webhook_endpoint",
      targetId: id,
      metadata: {
        environment_key: env?.environment_key || null,
        old_host: new URL(current.data.url).hostname,
        new_host: new URL(nextUrl).hostname,
        name_changed: nextName !== current.data.name,
        url_changed: nextUrl !== current.data.url,
      },
    });

    return NextResponse.json({ success: true, endpoint: updated.data });
  }

  if (action === "subscriptions") {
    const validatedEvents = validateDeveloperWebhookEventTypes({
      environmentKey: env?.environment_key || "development",
      eventTypes: body.event_types,
    });
    if (!validatedEvents.success) {
      return NextResponse.json(
        {
          success: false,
          error: validatedEvents.error,
          invalid_event_types: validatedEvents.invalid_event_types || [],
        },
        { status: validatedEvents.status || 400 },
      );
    }

    const updated = await supabaseAdmin
      .from("developer_webhook_endpoints")
      .update({
        event_types: validatedEvents.event_types,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organization_id", access.organizationId)
      .select("id,event_types,status,updated_at")
      .maybeSingle();
    if (updated.error) return databaseFailure(updated.error);

    await recordDeveloperSecurityAudit({
      organizationId: access.organizationId,
      actorUserId: access.user?.id || null,
      action: "webhook.subscriptions_updated",
      targetType: "developer_webhook_endpoint",
      targetId: id,
      metadata: {
        environment_key: env?.environment_key || null,
        event_types: validatedEvents.event_types,
      },
    });

    return NextResponse.json({ success: true, endpoint: updated.data });
  }

  if (action === "rotate_secret") {
    const secret = `whsec_${randomBytes(32).toString("base64url")}`;
    const rotated = await supabaseAdmin.rpc("rotate_developer_webhook_secret", {
      p_organization_id: access.organizationId,
      p_endpoint_id: id,
      p_secret: secret,
    });
    if (rotated.error) return fail(rotated.error.message);
    await recordDeveloperSecurityAudit({
      organizationId: access.organizationId,
      actorUserId: access.user?.id || null,
      action: "webhook.secret_rotated",
      targetType: "developer_webhook_endpoint",
      targetId: id,
      metadata: { environment_key: env?.environment_key || null },
    });
    return NextResponse.json({
      success: true,
      endpoint: { id, status: current.data.status || "ACTIVE" },
      signing_secret: secret,
      warning: "Copy this signing secret now. The previous secret is no longer valid.",
    });
  }

  const result = await supabaseAdmin
    .from("developer_webhook_endpoints")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", access.organizationId)
    .select("id,status,updated_at")
    .maybeSingle();
  if (result.error) return databaseFailure(result.error);
  await recordDeveloperSecurityAudit({
    organizationId: access.organizationId,
    actorUserId: access.user?.id || null,
    action: status === "DISABLED" ? "webhook.disabled" : "webhook.enabled",
    targetType: "developer_webhook_endpoint",
    targetId: id,
    metadata: { environment_key: env?.environment_key || null, status },
  });
  return NextResponse.json({ success: true, endpoint: result.data });
}
