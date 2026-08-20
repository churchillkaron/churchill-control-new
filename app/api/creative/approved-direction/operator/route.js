export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import crypto from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  CreativeMediaInspectionRuntime,
  materializeMedia,
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

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

function creativeMediaPolicy() {
  return {
    ffmpeg_path:
      process.env.CREATIVE_MEDIA_FFMPEG_PATH ||
      path.resolve(process.cwd(), ".avantiqo/bin/ffmpeg"),
    ffprobe_path:
      process.env.CREATIVE_MEDIA_FFPROBE_PATH ||
      path.resolve(process.cwd(), ".avantiqo/bin/ffprobe"),
  };
}

function runProcess(command, args, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const stderr = [];
    let timer = null;
    let settled = false;

    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(Buffer.concat(stderr).toString("utf8"));
    };

    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("CREATIVE_SCENE_ANALYSIS_TIMEOUT"));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", finish);
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `CREATIVE_SCENE_ANALYSIS_EXIT_${code}`,
        ));
        return;
      }
      finish();
    });
  });
}

function parseSceneScores(log = "") {
  const rows = [];
  const pattern = /pts_time:([0-9.]+)[\s\S]*?lavfi\.scene_score=([0-9.]+)/g;
  let match;
  while ((match = pattern.exec(log))) {
    const time = finite(match[1]);
    const score = finite(match[2]);
    if (time === null || score === null) continue;
    rows.push({
      time_seconds: Number(time.toFixed(6)),
      score: Number(score.toFixed(6)),
    });
  }
  return rows.sort((left, right) => left.time_seconds - right.time_seconds);
}

function buildSceneRanges(boundaries, duration, minimumSeconds = 0) {
  const points = [0, ...boundaries.map((item) => item.time_seconds), duration]
    .filter((value) => Number.isFinite(value))
    .map((value) => Number(Number(value).toFixed(6)));
  const unique = [...new Set(points)].sort((left, right) => left - right);
  const ranges = [];

  for (let index = 0; index < unique.length - 1; index += 1) {
    const start = unique[index];
    const end = unique[index + 1];
    const sceneDuration = Number((end - start).toFixed(6));
    if (sceneDuration <= 0 || sceneDuration < minimumSeconds) continue;
    const boundary = boundaries.find((item) => item.time_seconds === start);
    ranges.push({
      index: ranges.length,
      start_seconds: start,
      end_seconds: end,
      duration_seconds: sceneDuration,
      cut_score: boundary?.score ?? null,
    });
  }
  return ranges;
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
  if (access.success) return { mode: "ORGANIZATION_SESSION", access };
  if (authorizeOperatorToken(project, token)) {
    return { mode: "PROJECT_SCOPED_OPERATOR_TOKEN", access: null };
  }
  const error = new Error("CREATIVE_APPROVED_DIRECTION_OPERATOR_UNAUTHORIZED");
  error.status = access.status || 403;
  throw error;
}

async function persistResumeSection(project, key, values) {
  const metadata = object(project.metadata);
  const resume = object(metadata.approved_direction_resume);
  const previous = object(resume[key]);
  const { error } = await supabaseAdmin
    .from(TABLE)
    .update({
      metadata: {
        ...metadata,
        approved_direction_resume: {
          ...resume,
          [key]: {
            ...previous,
            ...values,
          },
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", project.id)
    .eq("organization_id", project.organization_id);
  if (error) throw error;
}

async function persistInspection(project, inspection) {
  return persistResumeSection(project, "source_inspection", inspection);
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

async function analyzeScenes({
  organizationId,
  project,
  role,
  threshold,
  minimumSceneSeconds,
}) {
  const resume = object(project.metadata?.approved_direction_resume);
  const sources = object(resume.sources);
  const bucket = text(resume.source_bucket);
  const storagePath = text(sources[role]);
  if (!bucket) throw new Error("APPROVED_DIRECTION_SOURCE_BUCKET_REQUIRED");
  if (!storagePath) throw new Error(`SOURCE_ROLE_NOT_FOUND:${role}`);

  const policy = creativeMediaPolicy();
  const inspection = object(resume.source_inspection?.[role]?.technical);
  let duration = finite(inspection.duration_seconds);
  if (!duration) {
    const inspected = await CreativeMediaInspectionRuntime.inspect({
      url: creativeStorageUri(bucket, storagePath),
      file_name: storagePath.split("/").pop(),
      mime_type: mimeForPath(storagePath),
      organization_id: organizationId,
      policy,
    });
    duration = finite(inspected.technical?.duration_seconds);
  }
  if (!duration) throw new Error(`SOURCE_DURATION_REQUIRED:${role}`);

  const materialized = await materializeMedia({
    url: creativeStorageUri(bucket, storagePath),
    file_name: storagePath.split("/").pop(),
    mime_type: mimeForPath(storagePath),
    organization_id: organizationId,
    policy,
  });

  try {
    const log = await runProcess(
      policy.ffmpeg_path,
      [
        "-hide_banner",
        "-i",
        materialized.file_path,
        "-filter:v",
        `select='gt(scene,${threshold})',metadata=print`,
        "-an",
        "-f",
        "null",
        "-",
      ],
    );
    const boundaries = parseSceneScores(log);
    const ranges = buildSceneRanges(
      boundaries,
      duration,
      minimumSceneSeconds,
    );
    return {
      role,
      threshold,
      minimum_scene_seconds: minimumSceneSeconds,
      duration_seconds: duration,
      boundary_count: boundaries.length,
      boundaries,
      ranges,
      analyzed_at: new Date().toISOString(),
    };
  } finally {
    await materialized.cleanup();
  }
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
    const caller = await requireAuthorizedCaller({
      request,
      project,
      organizationId,
      token,
    });

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
      const policy = creativeMediaPolicy();

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
            policy,
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
        authorization_mode: caller.mode,
        organization_id: organizationId,
        creative_project_id: projectId,
        media_binaries: {
          ffmpeg: path.basename(policy.ffmpeg_path),
          ffprobe: path.basename(policy.ffprobe_path),
        },
        results,
      });
    }

    if (action === "scenes") {
      const requestedRoles = text(url.searchParams.get("roles"))
        .split(",")
        .map((value) => text(value))
        .filter(Boolean);
      if (!requestedRoles.length) {
        throw new Error("CREATIVE_SCENE_ANALYSIS_ROLES_REQUIRED");
      }
      const threshold = Math.min(
        1,
        Math.max(0.05, finite(url.searchParams.get("threshold"), 0.22)),
      );
      const minimumSceneSeconds = Math.max(
        0,
        finite(url.searchParams.get("minimum_scene_seconds"), 1.25),
      );

      const results = {};
      for (const role of requestedRoles) {
        try {
          results[role] = await analyzeScenes({
            organizationId,
            project,
            role,
            threshold,
            minimumSceneSeconds,
          });
        } catch (error) {
          results[role] = {
            role,
            success: false,
            error: error?.message || String(error),
          };
        }
      }

      await persistResumeSection(project, "scene_analysis", results);
      return Response.json({
        success: true,
        action,
        authorization_mode: caller.mode,
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
      return Response.json({
        success: true,
        action,
        authorization_mode: caller.mode,
        result,
      });
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
      if (caller.mode === "PROJECT_SCOPED_OPERATOR_TOKEN") {
        await consumeToken(project);
      }
      return Response.json({
        success: true,
        action,
        authorization_mode: caller.mode,
        mode,
        result,
      });
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
    }, { status: error?.status || 500 });
  }
}
