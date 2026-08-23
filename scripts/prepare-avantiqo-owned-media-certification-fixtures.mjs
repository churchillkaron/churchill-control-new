import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "creative-assets";
const OUTPUT = path.resolve(
  process.env.AVANTIQO_MEDIA_CERTIFICATION_FIXTURES ||
    "/tmp/avantiqo-media-certification-fixtures.json",
);
const WORKDIR = fs.mkdtempSync(path.join(os.tmpdir(), "avantiqo-media-certification-"));
const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
const PREFIX = `platform-certification/owned-media-local/${RUN_ID}`;
const SOURCE_URL_TTL_SECONDS = 4 * 60 * 60;
const OUTPUT_CAPABILITIES = Object.freeze([
  "ai.image.generate",
  "ai.image.edit",
  "ai.image.inpaint",
  "ai.image.outpaint",
  "ai.image.upscale",
  "ai.video.generate",
  "ai.video.image_to_video",
  "ai.video.first_last_frame_to_video",
  "ai.video.video_to_video",
  "ai.video.edit",
  "ai.video.inpaint",
  "ai.video.extend",
  "ai.video.upscale",
  "ai.video.lipsync",
]);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function localFile(name) {
  const file = path.resolve(required(name));
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`${name}_FILE_REQUIRED:${file}`);
  }
  return file;
}

function command(name, args) {
  const result = spawnSync(name, args, {
    cwd: WORKDIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${name.toUpperCase()}_FAILED:${text(result.stderr).slice(-1200)}`);
  }
}

function requireFfmpeg() {
  const probe = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (probe.status !== 0) throw new Error("FFMPEG_REQUIRED_FOR_MEDIA_CERTIFICATION_FIXTURES");
}

async function sourceImages() {
  const imagePath = path.join(WORKDIR, "image-source.png");
  const maskPath = path.join(WORKDIR, "image-mask.png");
  const firstPath = path.join(WORKDIR, "video-first.png");
  const lastPath = path.join(WORKDIR, "video-last.png");

  const sourceSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
      <defs>
        <radialGradient id="g" cx="42%" cy="35%" r="70%">
          <stop offset="0" stop-color="#8795a5" stop-opacity="0.45"/>
          <stop offset="1" stop-color="#05070a" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1024" height="1024" fill="#05070a"/>
      <rect width="1024" height="1024" fill="url(#g)"/>
      <ellipse cx="512" cy="790" rx="290" ry="74" fill="#000" opacity="0.48"/>
      <rect x="342" y="230" width="340" height="520" rx="116" fill="#111820" stroke="#7f8b98" stroke-width="5"/>
      <rect x="382" y="286" width="104" height="360" rx="52" fill="#eef4f8" opacity="0.11"/>
    </svg>
  `);
  const maskSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
      <rect width="1024" height="1024" fill="#000"/>
      <ellipse cx="512" cy="470" rx="124" ry="124" fill="#fff"/>
    </svg>
  `);
  await sharp(sourceSvg).png().toFile(imagePath);
  await sharp(maskSvg).png().toFile(maskPath);
  await sharp(sourceSvg).resize(1280, 704, { fit: "cover" }).png().toFile(firstPath);
  await sharp(sourceSvg)
    .resize(1280, 704, { fit: "cover" })
    .modulate({ brightness: 1.08 })
    .png()
    .toFile(lastPath);
  return { imagePath, maskPath, firstPath, lastPath };
}

function syntheticVideo(firstFramePath) {
  requireFfmpeg();
  const videoPath = path.join(WORKDIR, "video-source.mp4");
  command("ffmpeg", [
    "-y",
    "-loop", "1",
    "-i", firstFramePath,
    "-t", "2",
    "-vf", "scale=1280:704,zoompan=z='min(zoom+0.0015,1.045)':d=32:s=1280x704:fps=16,format=yuv420p",
    "-an",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-movflags", "+faststart",
    videoPath,
  ]);
  return videoPath;
}

async function syntheticVideoMask() {
  const maskFrame = path.join(WORKDIR, "video-mask.png");
  const maskVideo = path.join(WORKDIR, "video-mask.mp4");
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="704">
      <rect width="1280" height="704" fill="#000"/>
      <ellipse cx="640" cy="350" rx="180" ry="150" fill="#fff"/>
    </svg>
  `);
  await sharp(svg).png().toFile(maskFrame);
  command("ffmpeg", [
    "-y",
    "-loop", "1",
    "-i", maskFrame,
    "-t", "2",
    "-vf", "fps=16,format=yuv420p",
    "-an",
    "-c:v", "libx264",
    "-crf", "0",
    maskVideo,
  ]);
  return maskVideo;
}

function supabaseClient() {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

async function uploadFile(supabase, localPath, remotePath, contentType) {
  const bytes = fs.readFileSync(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(remotePath, bytes, {
    contentType,
    cacheControl: "0",
    upsert: true,
  });
  if (error) throw new Error(`CERTIFICATION_FIXTURE_UPLOAD_FAILED:${remotePath}:${error.message}`);
  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(remotePath, SOURCE_URL_TTL_SECONDS);
  if (signError || !data?.signedUrl) {
    throw new Error(`CERTIFICATION_FIXTURE_SIGN_FAILED:${remotePath}:${signError?.message || "NO_URL"}`);
  }
  return {
    signed_url: data.signedUrl,
    storage_reference: `storage://${BUCKET}/${remotePath}`,
    size_bytes: bytes.length,
  };
}

async function outputTarget(supabase, capability) {
  const extension = capability.startsWith("ai.image.") ? "png" : "mp4";
  const safe = capability.replace(/[^A-Za-z0-9_-]/g, "-");
  const remotePath = `${PREFIX}/outputs/${safe}.${extension}`;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(remotePath, { upsert: true });
  if (error || !data?.signedUrl) {
    throw new Error(`CERTIFICATION_OUTPUT_TARGET_FAILED:${capability}:${error?.message || "NO_URL"}`);
  }
  return {
    signed_url: data.signedUrl,
    storage_reference: `storage://${BUCKET}/${remotePath}`,
  };
}

const faceVideoPath = localFile("AVANTIQO_MEDIA_CERTIFICATION_FACE_VIDEO_PATH");
const faceAudioPath = localFile("AVANTIQO_MEDIA_CERTIFICATION_FACE_AUDIO_PATH");
const supabase = supabaseClient();
const images = await sourceImages();
const videoPath = syntheticVideo(images.firstPath);
const videoMaskPath = await syntheticVideoMask();

const sourceUploads = {
  image_source: await uploadFile(supabase, images.imagePath, `${PREFIX}/image-source.png`, "image/png"),
  image_mask: await uploadFile(supabase, images.maskPath, `${PREFIX}/image-mask.png`, "image/png"),
  video_first_frame: await uploadFile(supabase, images.firstPath, `${PREFIX}/video-first.png`, "image/png"),
  video_last_frame: await uploadFile(supabase, images.lastPath, `${PREFIX}/video-last.png`, "image/png"),
  video_source: await uploadFile(supabase, videoPath, `${PREFIX}/video-source.mp4`, "video/mp4"),
  video_mask: await uploadFile(supabase, videoMaskPath, `${PREFIX}/video-mask.mp4`, "video/mp4"),
  lipsync_video: await uploadFile(supabase, faceVideoPath, `${PREFIX}/lipsync-face.mp4`, "video/mp4"),
  lipsync_audio: await uploadFile(supabase, faceAudioPath, `${PREFIX}/lipsync-audio.wav`, "audio/wav"),
};

const uploads = {};
for (const capability of OUTPUT_CAPABILITIES) {
  uploads[capability] = await outputTarget(supabase, capability);
}

const fixtures = {
  contract: "AVANTIQO_OWNED_MEDIA_CERTIFICATION_FIXTURES_V1",
  generated_at: new Date().toISOString(),
  source_scope: "BENCHMARK_ONLY",
  provider_calls_added: 0,
  prefix: PREFIX,
  image_source_url: sourceUploads.image_source.signed_url,
  image_mask_url: sourceUploads.image_mask.signed_url,
  video_first_frame_url: sourceUploads.video_first_frame.signed_url,
  video_last_frame_url: sourceUploads.video_last_frame.signed_url,
  video_source_url: sourceUploads.video_source.signed_url,
  video_mask_url: sourceUploads.video_mask.signed_url,
  lipsync_video_source_url: sourceUploads.lipsync_video.signed_url,
  audio_source_url: sourceUploads.lipsync_audio.signed_url,
  source_storage_references: Object.fromEntries(
    Object.entries(sourceUploads).map(([key, value]) => [key, value.storage_reference]),
  ),
  uploads,
  policy: {
    deterministic_non_lipsync_fixtures_generated_locally: true,
    lipsync_requires_real_face_video_and_matching_audio: true,
    benchmark_only_storage_scope: true,
    signed_source_urls_expire: true,
    production_activation_forbidden: true,
  },
};

fs.writeFileSync(OUTPUT, `${JSON.stringify(fixtures, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  contract: fixtures.contract,
  output_path: OUTPUT,
  prefix: PREFIX,
  provider_calls_added: 0,
  output_targets: OUTPUT_CAPABILITIES.length,
}, null, 2));
