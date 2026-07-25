export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import fs from "node:fs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  providerCredentialReadiness,
} from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

const CANONICAL_PRIVATE_RENDER_BUCKET = "creative-assets";

function configured(value) {
  return Boolean(String(value || "").trim());
}

function executable(value) {
  if (!configured(value)) return false;
  try {
    fs.accessSync(value, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function databaseReadiness() {
  try {
    const { data, error } = await supabaseAdmin.rpc(
      "creative_backend_runtime_readiness",
    );
    if (error) {
      return {
        ready: false,
        checks: [],
        blocking_checks: ["database_runtime_readiness_rpc_unavailable"],
        error: error.message,
      };
    }

    return {
      ready: data?.ready === true,
      checks: Array.isArray(data?.checks) ? data.checks : [],
      blocking_checks: Array.isArray(data?.blocking_checks)
        ? data.blocking_checks
        : ["database_runtime_readiness_invalid_response"],
      evaluated_at: data?.evaluated_at || null,
      error: null,
    };
  } catch (error) {
    return {
      ready: false,
      checks: [],
      blocking_checks: ["database_runtime_readiness_failed"],
      error: error.message,
    };
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    if (!organizationId) {
      return Response.json(
        { success: false, error: "organization_id required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: "creative.release.preflight",
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const ffmpegPath = process.env.CREATIVE_MEDIA_FFMPEG_PATH;
    const ffprobePath = process.env.CREATIVE_MEDIA_FFPROBE_PATH;
    const renderBucket = String(
      process.env.CREATIVE_MEDIA_RENDER_BUCKET || "",
    ).trim();
    const credentialReadiness = providerCredentialReadiness();
    const database = await databaseReadiness();
    const workerSecretConfigured = configured(
      process.env.AVANTIQO_INTERNAL_WORKER_SECRET || process.env.CRON_SECRET,
    );

    const checks = [
      {
        id: "supabase_url_configured",
        required: true,
        passed: configured(process.env.NEXT_PUBLIC_SUPABASE_URL),
      },
      {
        id: "supabase_anon_key_configured",
        required: true,
        passed: configured(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      },
      {
        id: "supabase_service_role_configured",
        required: true,
        passed: configured(process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
      {
        id: "database_runtime_contract_ready",
        required: true,
        passed: database.ready,
        blocking_checks: database.blocking_checks,
        error: database.error,
      },
      {
        id: "provider_credential_source_configured",
        required: true,
        passed: credentialReadiness.configured,
      },
      {
        id: "provider_credential_environment_valid",
        required: true,
        passed: credentialReadiness.environment_valid,
      },
      {
        id: "provider_asset_hosts_configured",
        required: true,
        passed: configured(process.env.CREATIVE_PROVIDER_ASSET_HOSTS),
      },
      {
        id: "worker_secret_configured",
        required: true,
        passed: workerSecretConfigured,
      },
      {
        id: "provider_callback_secret_configured",
        required: true,
        passed: configured(process.env.CREATIVE_PROVIDER_CALLBACK_SECRET),
      },
      {
        id: "publish_callback_secret_configured",
        required: true,
        passed: configured(process.env.CREATIVE_PUBLISH_CALLBACK_SECRET),
      },
      {
        id: "render_bucket_configured",
        required: true,
        passed: configured(renderBucket),
      },
      {
        id: "canonical_private_render_bucket",
        required: true,
        passed: renderBucket === CANONICAL_PRIVATE_RENDER_BUCKET,
        expected: CANONICAL_PRIVATE_RENDER_BUCKET,
      },
      {
        id: "ffmpeg_path_configured",
        required: true,
        passed: configured(ffmpegPath),
      },
      {
        id: "ffmpeg_executable",
        required: true,
        passed: executable(ffmpegPath),
      },
      {
        id: "ffprobe_path_configured",
        required: true,
        passed: configured(ffprobePath),
      },
      {
        id: "ffprobe_executable",
        required: true,
        passed: executable(ffprobePath),
      },
      {
        id: "render_timeout_configured",
        required: false,
        passed: configured(process.env.CREATIVE_MEDIA_RENDER_TIMEOUT_MS),
      },
      {
        id: "render_cache_control_configured",
        required: false,
        passed: configured(process.env.CREATIVE_MEDIA_RENDER_CACHE_CONTROL),
      },
      {
        id: "provider_asset_size_limit_configured",
        required: false,
        passed: configured(process.env.CREATIVE_PROVIDER_ASSET_MAX_BYTES),
      },
    ];
    const blocking = checks.filter((check) => check.required && !check.passed);
    const databaseBlocking = database.blocking_checks.map(
      (check) => `database:${check}`,
    );

    return Response.json({
      success: true,
      organization_id: organizationId,
      ready: blocking.length === 0,
      checks,
      blocking_checks: [
        ...blocking.map((check) => check.id),
        ...(database.ready ? [] : databaseBlocking),
      ],
      database_runtime: database,
      credential_source: {
        configured: credentialReadiness.configured,
        registered_resolver_count:
          credentialReadiness.registered_resolver_count,
        environment_configured:
          credentialReadiness.environment_configured,
      },
      evaluated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
