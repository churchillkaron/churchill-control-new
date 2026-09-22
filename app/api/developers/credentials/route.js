import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  availableDeveloperCredentialScopes,
  canManageDeveloperSecurity,
  developerCredentialScopeCatalog,
  recordDeveloperSecurityAudit,
  requireDeveloperPortalAccess,
  requireProductionDeveloperAuthority,
  resolveDeveloperCredentialExpiry,
  validateDeveloperCredentialScopes,
  validateDeveloperEnvironmentCredentialScopes,
} from "@/lib/developer/DeveloperPortalRuntime";
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

function hash(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organization_id") || searchParams.get("organizationId");
  const access = await requireDeveloperPortalAccess({ organizationId, request });
  if (!access.success) return fail(access.error || "Developer access required", access.status || 403);
  let query = supabaseAdmin
    .from("developer_api_credentials")
    .select("id,organization_id,environment_id,name,token_prefix,token_last_four,scopes,status,expires_at,last_used_at,created_at,revoked_at,created_by")
    .eq("organization_id", access.organizationId)
    .order("created_at", { ascending: false });
  if (!canManageDeveloperSecurity(access)) {
    query = query.eq("created_by", access.user?.id || "00000000-0000-0000-0000-000000000000");
  }
  const result = await query;
  if (result.error) return fail(result.error.message);
  return NextResponse.json({
    success: true,
    credentials: result.data || [],
    available_scopes: availableDeveloperCredentialScopes(access),
    scope_catalog: developerCredentialScopeCatalog(access),
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const access = await requireDeveloperPortalAccess({
    organizationId: body.organization_id || body.organizationId,
    request,
  });
  if (!access.success) return fail(access.error || "Developer access required", access.status || 403);

  const environmentId = String(body.environment_id || "").trim();
  if (!environmentId) return fail("environment_id required", 400);
  const environment = await supabaseAdmin
    .from("developer_environments")
    .select("id,environment_key,status")
    .eq("id", environmentId)
    .eq("organization_id", access.organizationId)
    .maybeSingle();
  if (environment.error) return fail(environment.error.message);
  if (!environment.data || environment.data.status !== "ACTIVE") {
    return fail("Active developer environment required", 400);
  }

  const authority = requireProductionDeveloperAuthority(access, environment.data.environment_key);
  if (!authority.success) return fail(authority.error, authority.status || 403);

  const validated = validateDeveloperCredentialScopes(access, body.scopes);
  if (!validated.success) return fail(validated.error, 403);
  const environmentPolicy = validateDeveloperEnvironmentCredentialScopes({
    environmentKey: environment.data.environment_key,
    scopes: validated.scopes,
  });
  if (!environmentPolicy.success) {
    return NextResponse.json(
      { success: false, error: environmentPolicy.error, disallowed_scopes: environmentPolicy.disallowed_scopes || [] },
      { status: environmentPolicy.status || 400 },
    );
  }

  const expiry = resolveDeveloperCredentialExpiry({
    environmentKey: environment.data.environment_key,
    expiresAt: body.expires_at || null,
    expiresInDays: body.expires_in_days || null,
  });
  if (!expiry.success) return fail(expiry.error, expiry.status || 400);

  const name = String(body.name || "API credential").trim().slice(0, 120);
  const secret = randomBytes(32).toString("base64url");
  const token = `avq_${environment.data.environment_key.slice(0, 4)}_${secret}`;
  const result = await supabaseAdmin
    .from("developer_api_credentials")
    .insert({
      organization_id: access.organizationId,
      environment_id: environmentId,
      name,
      token_prefix: token.slice(0, 14),
      token_hash: hash(token),
      token_last_four: token.slice(-4),
      scopes: validated.scopes,
      status: "ACTIVE",
      expires_at: expiry.expires_at,
      created_by: access.user?.id || null,
    })
    .select("id,environment_id,name,token_prefix,token_last_four,scopes,status,expires_at,created_at")
    .single();
  if (result.error) return databaseFailure(result.error);
  await recordDeveloperSecurityAudit({
    organizationId: access.organizationId,
    actorUserId: access.user?.id || null,
    action: "credential.created",
    targetType: "developer_api_credential",
    targetId: result.data.id,
    metadata: {
      environment_id: environmentId,
      environment_key: environment.data.environment_key,
      scopes: validated.scopes,
      expires_at: expiry.expires_at,
    },
  });
  return NextResponse.json({
    success: true,
    credential: result.data,
    token,
    warning: "Copy this token now. Avantiqo stores only its hash and cannot show it again.",
  }, { status: 201 });
}

export async function PATCH(request) {
  const body = await request.json().catch(() => ({}));
  const access = await requireDeveloperPortalAccess({
    organizationId: body.organization_id || body.organizationId,
    request,
  });
  if (!access.success) return fail(access.error || "Developer access required", access.status || 403);
  const id = String(body.id || "").trim();
  const action = String(body.action || "revoke").trim().toLowerCase();
  if (!id) return fail("credential id required", 400);
  if (!["revoke", "rotate"].includes(action)) return fail("Unsupported credential action", 400);

  const current = await supabaseAdmin
    .from("developer_api_credentials")
    .select("id,environment_id,name,scopes,status,created_by,developer_environments(environment_key,status)")
    .eq("id", id)
    .eq("organization_id", access.organizationId)
    .maybeSingle();
  if (current.error) return fail(current.error.message);
  if (!current.data) return fail("Credential not found", 404);
  if (!canManageDeveloperSecurity(access) && current.data.created_by !== access.user?.id) {
    return fail("Credential ownership or developer security authority required", 403);
  }
  const env = Array.isArray(current.data.developer_environments)
    ? current.data.developer_environments[0]
    : current.data.developer_environments;
  const authority = requireProductionDeveloperAuthority(access, env?.environment_key);
  if (!authority.success) return fail(authority.error, authority.status || 403);

  if (action === "rotate") {
    if (current.data.status !== "ACTIVE") return fail("Only active credentials can be rotated", 400);
    if (env?.status && env.status !== "ACTIVE") return fail("Active developer environment required", 400);

    const validated = validateDeveloperCredentialScopes(access, body.scopes || current.data.scopes || []);
    if (!validated.success) return fail(validated.error, 403);
    const environmentPolicy = validateDeveloperEnvironmentCredentialScopes({
      environmentKey: env?.environment_key || "development",
      scopes: validated.scopes,
    });
    if (!environmentPolicy.success) {
      return NextResponse.json(
        { success: false, error: environmentPolicy.error, disallowed_scopes: environmentPolicy.disallowed_scopes || [] },
        { status: environmentPolicy.status || 400 },
      );
    }
    const expiry = resolveDeveloperCredentialExpiry({
      environmentKey: env?.environment_key || "development",
      expiresAt: body.expires_at || null,
      expiresInDays: body.expires_in_days || null,
    });
    if (!expiry.success) return fail(expiry.error, expiry.status || 400);

    const secret = randomBytes(32).toString("base64url");
    const token = `avq_${String(env?.environment_key || "development").slice(0, 4)}_${secret}`;
    const rotated = await supabaseAdmin.rpc("rotate_developer_api_credential", {
      p_organization_id: access.organizationId,
      p_old_credential_id: id,
      p_environment_id: current.data.environment_id,
      p_name: String(body.name || current.data.name || "API credential").trim().slice(0, 120),
      p_token_prefix: token.slice(0, 14),
      p_token_hash: hash(token),
      p_token_last_four: token.slice(-4),
      p_scopes: validated.scopes,
      p_expires_at: expiry.expires_at,
      p_created_by: access.user?.id || null,
    });
    if (rotated.error) return databaseFailure(rotated.error);

    const nextId = rotated.data;
    const next = await supabaseAdmin
      .from("developer_api_credentials")
      .select("id,environment_id,name,token_prefix,token_last_four,scopes,status,expires_at,created_at")
      .eq("id", nextId)
      .eq("organization_id", access.organizationId)
      .single();
    if (next.error) return fail(next.error.message);

    await recordDeveloperSecurityAudit({
      organizationId: access.organizationId,
      actorUserId: access.user?.id || null,
      action: "credential.rotated",
      targetType: "developer_api_credential",
      targetId: next.data.id,
      metadata: {
        previous_credential_id: id,
        environment_key: env?.environment_key || null,
        scopes: validated.scopes,
        expires_at: expiry.expires_at,
      },
    });
    return NextResponse.json({
      success: true,
      credential: next.data,
      token,
      replaced_credential_id: id,
      warning: "Copy this token now. The previous credential is revoked and this token cannot be shown again.",
    });
  }

  const result = await supabaseAdmin
    .from("developer_api_credentials")
    .update({ status: "REVOKED", revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", access.organizationId)
    .select("id,status,revoked_at")
    .maybeSingle();
  if (result.error) return fail(result.error.message);
  await recordDeveloperSecurityAudit({
    organizationId: access.organizationId,
    actorUserId: access.user?.id || null,
    action: "credential.revoked",
    targetType: "developer_api_credential",
    targetId: id,
    metadata: { environment_key: env?.environment_key || null },
  });
  return NextResponse.json({ success: true, credential: result.data });
}
