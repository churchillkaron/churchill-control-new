import crypto from "node:crypto";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

const supabaseAdmin = getServiceSupabase();
const SUPPORTED_FORMATS = new Set(["vtt", "srt"]);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeSegment(value, fallback = "subtitle") {
  const normalized = String(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function cuesFromTranscript(transcript = {}) {
  const segments = transcript.metadata?.segments || transcript.segments || [];

  return (Array.isArray(segments) ? segments : [])
    .map((segment, index) => {
      const start = finite(segment.start_seconds ?? segment.start);
      const end = finite(segment.end_seconds ?? segment.end);
      const text = normalizeText(segment.text);

      if (start === null || end === null || end <= start || !text) return null;

      return {
        id: segment.id ?? index + 1,
        start_seconds: Math.max(0, start),
        end_seconds: Math.max(0, end),
        text,
        speaker: segment.speaker ?? segment.speaker_id ?? null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start_seconds - right.start_seconds);
}

function timestamp(seconds, separator) {
  const totalMilliseconds = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const milliseconds = totalMilliseconds % 1000;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const second = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minute = totalMinutes % 60;
  const hour = Math.floor(totalMinutes / 60);

  return [
    String(hour).padStart(2, "0"),
    String(minute).padStart(2, "0"),
    `${String(second).padStart(2, "0")}${separator}${String(milliseconds).padStart(3, "0")}`,
  ].join(":");
}

function cueText(cue, includeSpeaker) {
  if (!includeSpeaker || !cue.speaker) return cue.text;
  return `<v ${normalizeText(cue.speaker)}>${cue.text}`;
}

function renderVtt(cues, options = {}) {
  const blocks = cues.map((cue) => [
    String(cue.id),
    `${timestamp(cue.start_seconds, ".")} --> ${timestamp(cue.end_seconds, ".")}`,
    cueText(cue, options.include_speakers === true || options.includeSpeakers === true),
  ].join("\n"));

  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}

function renderSrt(cues, options = {}) {
  const blocks = cues.map((cue, index) => {
    const speakerPrefix =
      (options.include_speakers === true || options.includeSpeakers === true) && cue.speaker
        ? `${normalizeText(cue.speaker)}: `
        : "";

    return [
      String(index + 1),
      `${timestamp(cue.start_seconds, ",")} --> ${timestamp(cue.end_seconds, ",")}`,
      `${speakerPrefix}${cue.text}`,
    ].join("\n");
  });

  return `${blocks.join("\n\n")}\n`;
}

function render(format, cues, options) {
  if (format === "vtt") return renderVtt(cues, options);
  if (format === "srt") return renderSrt(cues, options);
  throw new Error(`Unsupported subtitle format: ${format}`);
}

function mimeType(format) {
  return format === "vtt" ? "text/vtt" : "application/x-subrip";
}

function subtitleIdentity(transcript, format, options = {}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    transcript_id: transcript.id,
    transcript_identity: transcript.metadata?.transcript_identity || null,
    format,
    include_speakers:
      options.include_speakers === true || options.includeSpeakers === true,
  })).digest("hex");
}

async function uploadSubtitle({
  organizationId,
  transcriptId,
  format,
  content,
  name,
  policy = {},
}) {
  const bucket =
    policy.subtitle_bucket ||
    policy.subtitleBucket ||
    process.env.CREATIVE_MEDIA_SUBTITLE_BUCKET ||
    null;

  if (!bucket) throw new Error("SUBTITLE_STORAGE_BUCKET_REQUIRED");

  const storagePath = [
    safeSegment(organizationId),
    "subtitles",
    safeSegment(transcriptId),
    crypto.randomUUID(),
    `${safeSegment(name || "subtitle")}.${format}`,
  ].join("/");
  const buffer = Buffer.from(content, "utf8");
  const uploadOptions = {
    contentType: mimeType(format),
    upsert: false,
  };
  const cacheControl =
    policy.subtitle_cache_control ||
    policy.subtitleCacheControl ||
    process.env.CREATIVE_MEDIA_SUBTITLE_CACHE_CONTROL ||
    null;

  if (cacheControl) uploadOptions.cacheControl = String(cacheControl);

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, uploadOptions);

  if (error) throw error;

  const { data } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(storagePath);

  return {
    bucket,
    storage_path: storagePath,
    public_url: data.publicUrl,
    file_size_bytes: buffer.length,
    checksum_sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

export const CreativeSubtitleRuntime = {
  async create({
    organization_id,
    transcript_asset_node_id,
    formats = ["vtt", "srt"],
    options = {},
    policy = {},
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!transcript_asset_node_id) throw new Error("transcript_asset_node_id required");

    const transcript = await AssetGraphRepository.getById(transcript_asset_node_id);
    if (!transcript || transcript.organization_id !== organization_id) {
      throw new Error("Transcript asset node not found");
    }
    if (transcript.type !== CREATIVE_ASSET_NODE_TYPES.SUBTITLE) {
      throw new Error("Transcript asset node type required");
    }

    const cues = cuesFromTranscript(transcript);
    if (!cues.length) throw new Error("TIMESTAMPED_TRANSCRIPT_SEGMENTS_REQUIRED");

    const requestedFormats = [...new Set(
      (Array.isArray(formats) ? formats : [formats])
        .map((format) => String(format || "").toLowerCase())
        .filter((format) => SUPPORTED_FORMATS.has(format)),
    )];

    if (!requestedFormats.length) throw new Error("SUPPORTED_SUBTITLE_FORMAT_REQUIRED");

    const projectNodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: transcript.creative_project_id,
    });
    const results = [];

    for (const format of requestedFormats) {
      const identity = subtitleIdentity(transcript, format, options);
      const existing = !force
        ? projectNodes.find((node) =>
            node.parent_asset_node_id === transcript.id &&
            node.metadata?.subtitle_identity === identity,
          )
        : null;

      if (existing) {
        results.push({ node: existing, reused: true });
        continue;
      }

      const content = render(format, cues, options);
      const uploaded = await uploadSubtitle({
        organizationId: organization_id,
        transcriptId: transcript.id,
        format,
        content,
        name: options.name || transcript.name || "subtitle",
        policy,
      });
      const node = createCreativeAssetNode({
        organization_id,
        creative_project_id: transcript.creative_project_id,
        creative_asset_id: transcript.creative_asset_id,
        parent_asset_node_id: transcript.id,
        type: CREATIVE_ASSET_NODE_TYPES.SUBTITLE,
        status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
        name: `${options.name || transcript.name || "Subtitle"}.${format}`,
        description: options.description || "",
        url: uploaded.public_url,
        storage_path: uploaded.storage_path,
        lineage: {
          source: "transcript_render",
          provider_id: transcript.lineage?.provider_id || null,
          capability: `subtitle.${format}`,
          generation_version: options.version || 1,
        },
        technical: {
          mime_type: mimeType(format),
          duration_seconds: transcript.technical?.duration_seconds || null,
          checksum: uploaded.checksum_sha256,
        },
        intelligence: {
          tags: Array.isArray(options.tags) ? options.tags : [],
          safety_status: transcript.intelligence?.safety_status || "UNKNOWN",
        },
        cost: {
          currency: null,
          estimated: 0,
          actual: 0,
          saved_by_reuse: 0,
        },
        reuse: {
          reusable: false,
          approved_for_reuse: false,
        },
        review: {
          ai_reviewed: false,
          human_reviewed: false,
          approved: false,
        },
        metadata: {
          subtitle_identity: identity,
          subtitle_format: format,
          transcript_asset_node_id: transcript.id,
          source_asset_node_id:
            transcript.metadata?.source_asset_node_id ||
            transcript.parent_asset_node_id ||
            null,
          language: transcript.metadata?.language || null,
          cue_count: cues.length,
          first_cue_seconds: cues[0].start_seconds,
          last_cue_seconds: cues[cues.length - 1].end_seconds,
          include_speakers:
            options.include_speakers === true || options.includeSpeakers === true,
          bucket: uploaded.bucket,
          created_at: new Date().toISOString(),
        },
      });

      results.push({
        node: await AssetGraphRepository.create(node),
        reused: false,
      });
    }

    return results;
  },
};
