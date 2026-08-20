export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeToolRegistry,
} from "@/lib/creative/tools/registry/CreativeToolRegistry";
import {
  CreativeSandboxRuntime,
} from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

const TABLE = "creative_projects";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function tokenHash(value) {
  return crypto.createHash("sha256").update(text(value)).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(text(left));
  const b = Buffer.from(text(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function getProject(projectId, organizationId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", projectId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CREATIVE_PROJECT_NOT_FOUND");
  return data;
}

function authorizeOperatorToken(project, suppliedToken) {
  const operator = object(
    project.metadata?.approved_direction_resume?.operator_execution,
  );
  if (!suppliedToken || !operator.token_sha256) return false;
  if (operator.consumed === true) return false;
  if (
    operator.expires_at &&
    Number.isFinite(Date.parse(operator.expires_at)) &&
    Date.parse(operator.expires_at) <= Date.now()
  ) {
    return false;
  }
  return safeEqual(tokenHash(suppliedToken), operator.token_sha256);
}

async function requireAuthorizedCaller({ request, project, organizationId, token }) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
    requiredPermission: "creative.media.analyse",
  });
  if (access.success) return { mode: "ORGANIZATION_SESSION" };
  if (authorizeOperatorToken(project, token)) {
    return { mode: "PROJECT_SCOPED_OPERATOR_TOKEN" };
  }
  const error = new Error("CREATIVE_TOOL_OPERATOR_UNAUTHORIZED");
  error.status = access.status || 403;
  throw error;
}

async function persistToolSnapshot(project, result) {
  const metadata = object(project.metadata);
  const current = object(metadata.creative_tool_snapshots);
  const toolId = text(result.tool_id);
  const next = {
    ...current,
    [toolId]: {
      tool_id: toolId,
      snapshot_id: result.snapshot_id || null,
      sandbox_contract: result.contract || null,
      ready: result.ready === true,
      verified_at: new Date().toISOString(),
    },
  };

  const { error } = await supabaseAdmin
    .from(TABLE)
    .update({
      metadata: {
        ...metadata,
        creative_tool_snapshots: next,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", project.id)
    .eq("organization_id", project.organization_id);
  if (error) throw error;
  return next;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organization_id"));
    const projectId = text(url.searchParams.get("creative_project_id"));
    const action = text(url.searchParams.get("action")).toLowerCase();
    const token = text(url.searchParams.get("token"));
    const toolId = text(url.searchParams.get("tool_id")).toLowerCase();

    if (!organizationId || !projectId || !action) {
      return Response.json({
        success: false,
        error: "organization_id, creative_project_id and action required",
      }, { status: 400 });
    }

    const project = await getProject(projectId, organizationId);
    const caller = await requireAuthorizedCaller({
      request,
      project,
      organizationId,
      token,
    });

    if (action === "readiness") {
      return Response.json({
        success: true,
        action,
        authorization_mode: caller.mode,
        tools: CreativeToolRegistry.list(),
        sandbox_registered_tools: CreativeSandboxRuntime.registered_tools,
        snapshots: object(project.metadata?.creative_tool_snapshots),
      });
    }

    if (action === "verify-sandbox") {
      const result = await CreativeSandboxRuntime.verify();
      return Response.json({
        success: true,
        action,
        authorization_mode: caller.mode,
        result,
      });
    }

    if (action === "bootstrap") {
      if (!toolId) {
        return Response.json({
          success: false,
          error: "tool_id required",
        }, { status: 400 });
      }

      const registered = CreativeSandboxRuntime.registered_tools.includes(toolId);
      if (!registered) {
        return Response.json({
          success: false,
          error: `CREATIVE_SANDBOX_TOOL_NOT_REGISTERED:${toolId}`,
        }, { status: 400 });
      }

      const result = await CreativeSandboxRuntime.bootstrapTool({
        tool_id: toolId,
        create_snapshot: true,
        snapshot_expiration_ms: 0,
      });
      const snapshots = await persistToolSnapshot(project, result);

      return Response.json({
        success: true,
        action,
        authorization_mode: caller.mode,
        result,
        snapshots,
      });
    }

    return Response.json({
      success: false,
      error: "CREATIVE_TOOL_OPERATOR_ACTION_NOT_SUPPORTED",
    }, { status: 400 });
  } catch (error) {
    console.error("CREATIVE_TOOL_OPERATOR_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });
    return Response.json({
      success: false,
      error: error?.message || String(error),
      details: error?.details || null,
    }, { status: error?.status || 500 });
  }
}
