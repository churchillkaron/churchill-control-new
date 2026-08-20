export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  CreativeMediaInspectionRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  CreativeApprovedDirectionResumeRuntime,
} from "@/lib/creative/execution/runtime/CreativeApprovedDirectionResumeRuntime";

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

function mimeForPath(value) {
  const lower = text(value).toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
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

function authorize(project, suppliedToken) {
  const operator = object(
    project.metadata?.approved_direction_resume?.operator_execution,
  );
  if (!suppliedToken || !operator.token_sha256) {
    throw new Error("CREATIVE_OPERATOR_TOKEN_REQUIRED");
  }
  if (operator.consumed === true) {
    throw new Error("CREATIVE_OPERATOR_TOKEN_CONSUMED");
  }
  if (
    operator.expires_at &&
    Number.isFinite(Date.parse(operator.expires_at)) &&
    Date.parse(operator.expires_at) <= Date.now()
  ) {
    throw new Error("CREATIVE_OPERATOR_TOKEN_EXPIRED");
  }
  if (!safeEqual(tokenHash(suppliedToken), operator.token_sha256)) {
    throw new Error("CREATIVE_OPERATOR_TOKEN_INVALID");
  }
}

async function persistInspection(project, inspection) {
  const metadata = object(project.metadata);
  const resume = object(metadata.approved_direction_resume);
  const previous = object(resume.source_inspection);
  const { error } = await supabaseAdmin
    .from(TABLE)
    .update({
      metadata: {
        ...metadata,
        approved_direction_resume: {
          ...resume,
          source_inspection: {
            ...previous,
            ...inspection,
          },
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", project.id)
    .eq("organization_id", project.organization_id);
  if (error) throw error;
}

async function consumeToken(project) {
  const metadata = object(project.metadata);
  const resume = object(metadata.approved_direction_resume);
  const operator = object(resume.operator_execution);
  const { error } = await supabaseAdmin
    .from(TABLE)
    .update({
      metadata: {
        ...metadata,
        approved_direction_resume: {
          ...resume,
          operator_execution: {
            ...operator,
            consumed: true,
            consumed_at: new Date().toISOString(),
          },
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", project.id)
    .eq("organization_id", project.organization_id);
  if (error) throw error;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organization_id"));
    const projectId = text(url.searchParams.get("creative_project_id"));
    const action = text(url.searchParams.get("action")).toLowerCase();
    const token = text(url.searchParams.get("token"));

    if (!organizationId || !projectId || !action) {
      return Response.json({
        success: false,
        error: "organization_id, creative_project_id and action required",
      }, { status: 400 });
    }

    const project = await getProject(projectId, organizationId);
    authorize(project, token);

    if (action === "inspect") {
      const resume = object(project.metadata?.approved_direction_resume);
      const sources = object(resume.sources);
      const bucket = text(resume.source_bucket);
      if (!bucket) throw new Error("APPROVED_DIRECTION_SOURCE_BUCKET_REQUIRED");

      const requestedRoles = text(url.searchParams.get("roles"))
        .split(",")
        .map((value) => text(value))
        .filter(Boolean);
      const roles = requestedRoles.length
        ? requestedRoles
        : Object.keys(sources);

      const results = {};
      for (const role of roles) {
        const storagePath = text(sources[role]);
        if (!storagePath) {
          results[role] = { success: false, error: "SOURCE_ROLE_NOT_FOUND" };
          continue;
        }
        try {
          const inspected = await CreativeMediaInspectionRuntime.inspect({
            url: creativeStorageUri(bucket, storagePath),
            file_name: storagePath.split("/").pop(),
            mime_type: mimeForPath(storagePath),
            organization_id: organizationId,
            policy: {},
          });
          results[role] = {
            success: true,
            status: inspected.status,
            reason: inspected.reason,
            technical: inspected.technical,
          };
        } catch (error) {
          results[role] = {
            success: false,
            error: error?.message || String(error),
          };
        }
      }

      await persistInspection(project, results);
      return Response.json({
        success: true,
        action,
        organization_id: organizationId,
        creative_project_id: projectId,
        results,
      });
    }

    if (action === "inspect-resume") {
      const result = await CreativeApprovedDirectionResumeRuntime.inspect({
        organization_id: organizationId,
        creative_project_id: projectId,
      });
      return Response.json({ success: true, action, result });
    }

    if (action === "render") {
      const mode = text(url.searchParams.get("mode")).toUpperCase() === "PROOF"
        ? "PROOF"
        : "FULL";
      const force = text(url.searchParams.get("force")).toLowerCase() === "true";
      const result = await CreativeApprovedDirectionResumeRuntime.render({
        organization_id: organizationId,
        creative_project_id: projectId,
        mode,
        force,
      });
      await consumeToken(project);
      return Response.json({ success: true, action, mode, result });
    }

    return Response.json({
      success: false,
      error: "CREATIVE_OPERATOR_ACTION_NOT_SUPPORTED",
    }, { status: 400 });
  } catch (error) {
    console.error("CREATIVE_APPROVED_DIRECTION_OPERATOR_FAILED", {
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    return Response.json({
      success: false,
      error: error?.message || String(error),
    }, { status: 500 });
  }
}
