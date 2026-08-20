export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  creativeStorageUri,
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const SOURCE = "storage://creative-assets/33336a72-acb5-474e-856b-8be0269360e2/37ca49f2-210d-4665-af6b-6b5fa834f750/renders/cd77a430-a746-4a3d-bb7f-f13f9a32c09b/avantiqo-world-class-master-v1-proof.mp4";
const OUTPUT_PATH = "33336a72-acb5-474e-856b-8be0269360e2/37ca49f2-210d-4665-af6b-6b5fa834f750/renders/safari/avantiqo-investor-proof-faststart.mp4";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function hash(value) {
  return crypto.createHash("sha256").update(text(value)).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(text(left));
  const b = Buffer.from(text(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorized(project, suppliedToken) {
  const operator = object(
    project?.metadata?.approved_direction_resume?.operator_execution,
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
  return safeEqual(hash(suppliedToken), operator.token_sha256);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `FASTSTART_EXIT_${code}`,
        ));
        return;
      }
      resolve();
    });
  });
}

async function ensureFastStart() {
  const existing = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(OUTPUT_PATH, 60);
  if (!existing.error && existing.data?.signedUrl) return;

  const ffmpeg = path.resolve(process.cwd(), ".avantiqo/bin/ffmpeg");
  const materialized = await materializeMedia({
    url: SOURCE,
    organization_id: ORGANIZATION_ID,
    policy: {
      ffmpeg_path: ffmpeg,
      ffprobe_path: path.resolve(process.cwd(), ".avantiqo/bin/ffprobe"),
    },
  });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-proof-faststart-"));
  const output = path.join(directory, "proof-faststart.mp4");

  try {
    await run(ffmpeg, [
      "-y",
      "-i",
      materialized.file_path,
      "-map",
      "0",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      output,
    ]);
    const buffer = await fs.readFile(output);
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(OUTPUT_PATH, buffer, {
        contentType: "video/mp4",
        cacheControl: "3600",
        upsert: true,
      });
    if (error) throw error;
  } finally {
    await materialized.cleanup();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const token = text(url.searchParams.get("token"));

    const { data: project, error } = await supabaseAdmin
      .from("creative_projects")
      .select("id, organization_id, metadata")
      .eq("id", PROJECT_ID)
      .eq("organization_id", ORGANIZATION_ID)
      .maybeSingle();
    if (error) throw error;
    if (!project) throw new Error("CREATIVE_PROJECT_NOT_FOUND");
    if (!authorized(project, token)) {
      return Response.json({ success: false, error: "UNAUTHORIZED" }, { status: 403 });
    }

    await ensureFastStart();

    const reference = creativeStorageUri(BUCKET, OUTPUT_PATH);
    const signedUrl = await signCreativeStorageReference({
      organization_id: ORGANIZATION_ID,
      reference,
      expires_in: 21600,
    });

    return Response.json({
      success: true,
      safari_faststart: true,
      reencoded: false,
      source_asset_node_id: "cd77a430-a746-4a3d-bb7f-f13f9a32c09b",
      duration_seconds: 40,
      signed_url: signedUrl,
      expires_in_seconds: 21600,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error?.message || String(error),
    }, { status: 500 });
  }
}
