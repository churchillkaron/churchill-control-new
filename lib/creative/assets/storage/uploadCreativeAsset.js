import crypto from "node:crypto";
import path from "node:path";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabaseAdmin = getServiceSupabase();
const BUCKET = "creative-assets";

const MIME_EXTENSIONS = Object.freeze({
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/flac": ".flac",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/json": ".json",
  "application/zip": ".zip",
});

function text(value) {
  return String(value || "").trim();
}

function sanitizeSegment(value, fallback = "file") {
  const normalized = text(value)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 100);
  return normalized || fallback;
}

function fileName(file) {
  return text(file?.name || file?.fileName || file?.filename || "asset");
}

function mimeType(file) {
  return text(file?.type || file?.mime_type || file?.mimeType || "application/octet-stream")
    .toLowerCase();
}

function extensionFor(file, mime) {
  const ext = path.extname(fileName(file)).toLowerCase();
  if (ext && ext.length <= 12) return ext;
  return MIME_EXTENSIONS[mime] || ".bin";
}

async function fileBytes(file) {
  if (!file) throw new Error("Creative asset file required");
  if (Buffer.isBuffer(file)) return file;
  if (file instanceof Uint8Array) return Buffer.from(file);
  if (typeof file.arrayBuffer === "function") {
    return Buffer.from(await file.arrayBuffer());
  }
  if (file.buffer) return Buffer.from(file.buffer);
  throw new Error("Unsupported Creative asset file payload");
}

function classifyMime(mime) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf" || mime.startsWith("text/")) return "document";
  if (mime.includes("zip") || mime.includes("compressed")) return "archive";
  return "file";
}

export async function uploadCreativeAsset({
  file,
  organizationId,
  creativeMissionId = null,
  creativeProjectId = null,
  uploadedBy = null,
} = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const bytes = await fileBytes(file);
  if (!bytes.length) throw new Error("Creative asset file is empty");

  const mime = mimeType(file);
  const originalName = fileName(file);
  const extension = extensionFor(file, mime);
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const objectId = crypto.randomUUID();
  const safeBase = sanitizeSegment(path.basename(originalName, path.extname(originalName)), "asset");
  const storagePath = [
    sanitizeSegment(organizationId, "organization"),
    creativeProjectId ? sanitizeSegment(creativeProjectId, "project") : "unassigned",
    `${objectId}-${safeBase}${extension}`,
  ].join("/");

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: mime,
      upsert: false,
      cacheControl: "3600",
      metadata: {
        organization_id: String(organizationId),
        creative_mission_id: creativeMissionId ? String(creativeMissionId) : "",
        creative_project_id: creativeProjectId ? String(creativeProjectId) : "",
        uploaded_by: uploadedBy ? String(uploadedBy) : "",
        original_file_name: originalName,
        checksum_sha256: checksum,
      },
    });

  if (error) throw error;

  return {
    bucket: BUCKET,
    path: storagePath,
    file_url: `storage://${BUCKET}/${storagePath}`,
    signed_url_required: true,
    original_file_name: originalName,
    mime_type: mime,
    extension,
    media_kind: classifyMime(mime),
    size_bytes: bytes.length,
    checksum_sha256: checksum,
    uploaded_at: new Date().toISOString(),
  };
}
