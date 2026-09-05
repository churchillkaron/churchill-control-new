import crypto from "node:crypto";
import { spawn } from "node:child_process";

import "@/lib/platform/service-runtime/providers/meta/ManagedMetaCredentialRegistration";
import "@/lib/platform/service-runtime/providers/google/GoogleCredentialRegistration.js";
import "@/lib/platform/service-runtime/providers/linkedin/LinkedInCredentialRegistration.js";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  resolveCreativeFfmpegPath,
  resolveCreativeFfprobePath,
} from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import {
  resolveProviderCredential,
} from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import {
  CreativePublicationLifecycleRuntime,
} from "@/lib/creative/release/runtime/CreativePublicationLifecycleRuntime";

const CONTRACT = "CREATIVE_PUBLICATION_REMOTE_MEDIA_IDENTITY_V1";
const LIFECYCLE_CONTRACT = "CREATIVE_PUBLICATION_LIFECYCLE_V1";
const OUTPUT_LIMIT_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_ANALYSIS_SECONDS = 600;
const DEFAULT_MAX_MEDIA_BYTES = 512 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 180000;

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replaceAll("_", "-");
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value, fallback) {
  const number = finite(value);
  return number !== null && number > 0 ? number : fallback;
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function newest(nodes, predicate) {
  return [...nodes]
    .filter(predicate)
    .sort((left, right) =>
      Date.parse(right.updated_at || right.created_at || 0) -
      Date.parse(left.updated_at || left.created_at || 0),
    )[0] || null;
}

function targetChannel(command = {}) {
  return normalized(
    command.metadata?.certified_derivative_channel ||
    command.metadata?.publish_target?.channel ||
    command.metadata?.publish_target_id,
  );
}

function providerFor(command = {}, execution = {}) {
  const channel = targetChannel(command);
  if (["facebook", "instagram"].includes(channel)) return "meta";
  if (["google-business", "googlebusiness"].includes(channel)) return "google";
  if (channel === "linkedin") return "linkedin";
  const provider = normalized(
    execution.metadata?.provider_id ||
    command.metadata?.publish_target?.provider_id ||
    command.metadata?.publish_target?.provider ||
    command.metadata?.publish_target?.connector,
  );
  if (["meta", "facebook", "instagram"].includes(provider)) return "meta";
  if (["google", "google-business", "googlebusiness"].includes(provider)) return "google";
  if (provider === "linkedin") return "linkedin";
  return null;
}

function mediaKind(render = {}) {
  const mime = text(render.technical?.mime_type).toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

function currentExecution(nodes, command) {
  const exact = command.metadata?.publish_execution_asset_node_id
    ? nodes.find((node) =>
        node.id === command.metadata.publish_execution_asset_node_id &&
        node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION,
      )
    : null;
  return exact || newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION &&
    node.metadata?.publish_command_asset_node_id === command.id,
  );
}

function historicalPublicationEvidence(nodes, commandId, executionId) {
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
    node.metadata?.publish_command_asset_node_id === commandId &&
    (!executionId || node.parent_asset_node_id === executionId) &&
    node.metadata?.remote_verified === true &&
    node.metadata?.published === true,
  );
}

function lifecycleEvidence(nodes, commandId, executionId) {
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
    node.metadata?.contract === LIFECYCLE_CONTRACT &&
    node.metadata?.observation_kind === "POST_PUBLICATION_LIFECYCLE" &&
    node.metadata?.publish_command_asset_node_id === commandId &&
    (!executionId || node.parent_asset_node_id === executionId),
  );
}

function mediaIdentityEvidence(nodes, commandId, executionId) {
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
    node.metadata?.contract === CONTRACT &&
    node.metadata?.observation_kind === "PUBLICATION_REMOTE_MEDIA_IDENTITY" &&
    node.metadata?.publish_command_asset_node_id === commandId &&
    (!executionId || node.parent_asset_node_id === executionId),
  );
}

function graphVersion() {
  const configured = text(
    process.env.META_GRAPH_API_VERSION ||
    process.env.META_GRAPH_VERSION ||
    "v24.0",
  );
  return configured.startsWith("v") ? configured : `v${configured}`;
}

function linkedInVersion() {
  return text(process.env.LINKEDIN_API_VERSION) || "202607";
}

async function jsonRequest(url, { accessToken, headers = {} } = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...headers,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      text(payload?.error?.message || payload?.message) ||
      `REMOTE_MEDIA_LOOKUP_FAILED_${response.status}`,
    );
    error.http_status = response.status;
    error.remote_code = payload?.error?.code || null;
    throw error;
  }
  return payload;
}

function referenceIdentity(value) {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return {
      host: parsed.hostname.toLowerCase(),
      path_digest: digest(parsed.pathname),
    };
  } catch {
    return { host: null, path_digest: digest(candidate) };
  }
}

async function resolveInstagramMedia({ externalId, credential }) {
  const url = new URL(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(externalId)}`,
  );
  url.searchParams.set(
    "fields",
    "id,media_type,media_product_type,media_url,thumbnail_url",
  );
  const payload = await jsonRequest(url, { accessToken: credential.access_token });
  if (text(payload.id) !== externalId) {
    throw new Error("REMOTE_MEDIA_PUBLICATION_IDENTITY_MISMATCH");
  }
  const representationUrl = text(payload.media_url) || null;
  return {
    provider: "meta",
    channel: "instagram",
    remote_media_object_id: text(payload.id) || externalId,
    remote_media_kind: text(payload.media_type).toLowerCase() || null,
    remote_media_product_type: payload.media_product_type || null,
    representation_url: representationUrl,
    representation_kind: representationUrl ? "PROVIDER_CDN_REPRESENTATION" : null,
    representation_reference: referenceIdentity(representationUrl),
    relationship_reference: referenceIdentity(payload.thumbnail_url),
    downloadable_representation: Boolean(representationUrl),
  };
}

function facebookAttachmentMedia(attachment = {}, expectedKind) {
  const source = text(attachment?.media?.source);
  const image = text(attachment?.media?.image?.src);
  if (expectedKind === "video" && source) return source;
  if (expectedKind === "image" && image) return image;
  return source || image || null;
}

async function resolveFacebookMedia({ externalId, credential, expectedKind }) {
  if (expectedKind === "video") {
    try {
      const objectUrl = new URL(
        `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(externalId)}`,
      );
      objectUrl.searchParams.set("fields", "id,source");
      const object = await jsonRequest(objectUrl, { accessToken: credential.access_token });
      const source = text(object.source);
      if (source) {
        return {
          provider: "meta",
          channel: "facebook",
          remote_media_object_id: text(object.id) || externalId,
          remote_media_kind: "video",
          representation_url: source,
          representation_kind: "PROVIDER_CDN_REPRESENTATION",
          representation_reference: referenceIdentity(source),
          relationship_reference: null,
          downloadable_representation: true,
        };
      }
    } catch {
      // Feed posts are not always video nodes. Fall through to attachment lookup.
    }
  }

  const attachmentsUrl = new URL(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(externalId)}/attachments`,
  );
  attachmentsUrl.searchParams.set("fields", "media_type,media,target,url");
  attachmentsUrl.searchParams.set("limit", "10");
  const payload = await jsonRequest(attachmentsUrl, {
    accessToken: credential.access_token,
  });
  const attachments = Array.isArray(payload.data) ? payload.data : [];
  const selected = attachments.find((entry) => facebookAttachmentMedia(entry, expectedKind)) ||
    attachments[0] ||
    null;
  const representationUrl = selected
    ? facebookAttachmentMedia(selected, expectedKind)
    : null;
  return {
    provider: "meta",
    channel: "facebook",
    remote_media_object_id: text(selected?.target?.id) || externalId,
    remote_media_kind: text(selected?.media_type).toLowerCase() || expectedKind || null,
    representation_url: representationUrl,
    representation_kind: representationUrl ? "PROVIDER_CDN_REPRESENTATION" : null,
    representation_reference: referenceIdentity(representationUrl),
    relationship_reference: referenceIdentity(selected?.url || selected?.target?.url),
    downloadable_representation: Boolean(representationUrl),
  };
}

async function resolveLinkedInMedia({ externalId, credential, expectedKind, command }) {
  const headers = {
    "Linkedin-Version": linkedInVersion(),
    "X-Restli-Protocol-Version": "2.0.0",
  };
  const post = await jsonRequest(
    `https://api.linkedin.com/rest/posts/${encodeURIComponent(externalId)}?viewContext=AUTHOR`,
    { accessToken: credential.access_token, headers },
  );
  if (text(post.id) !== externalId) {
    throw new Error("REMOTE_MEDIA_PUBLICATION_IDENTITY_MISMATCH");
  }
  const expectedAuthor = text(command.metadata?.publish_target?.author_urn);
  if (expectedAuthor && text(post.author) !== expectedAuthor) {
    throw new Error("REMOTE_MEDIA_AUTHOR_IDENTITY_MISMATCH");
  }
  const mediaId = text(post.content?.media?.id);
  if (!mediaId) {
    return {
      provider: "linkedin",
      channel: "linkedin",
      remote_media_object_id: null,
      remote_media_kind: expectedKind || null,
      representation_url: null,
      representation_kind: null,
      representation_reference: null,
      relationship_reference: null,
      downloadable_representation: false,
    };
  }
  if (!["video", "image"].includes(expectedKind)) {
    return {
      provider: "linkedin",
      channel: "linkedin",
      remote_media_object_id: mediaId,
      remote_media_kind: expectedKind || null,
      representation_url: null,
      representation_kind: "PROVIDER_MEDIA_OBJECT",
      representation_reference: null,
      relationship_reference: { host: "linkedin.com", path_digest: digest(mediaId) },
      downloadable_representation: false,
    };
  }
  const family = expectedKind === "video" ? "videos" : "images";
  const asset = await jsonRequest(
    `https://api.linkedin.com/rest/${family}/${encodeURIComponent(mediaId)}`,
    { accessToken: credential.access_token, headers },
  );
  const returnedId = text(asset.id);
  if (returnedId && returnedId !== mediaId) {
    throw new Error("REMOTE_MEDIA_OBJECT_IDENTITY_MISMATCH");
  }
  const representationUrl = text(asset.downloadUrl) || null;
  return {
    provider: "linkedin",
    channel: "linkedin",
    remote_media_object_id: mediaId,
    remote_media_kind: expectedKind,
    remote_media_status: asset.status || null,
    remote_media_duration_ms: finite(asset.duration),
    representation_url: representationUrl,
    representation_kind: representationUrl ? "PROVIDER_CDN_REPRESENTATION" : "PROVIDER_MEDIA_OBJECT",
    representation_reference: referenceIdentity(representationUrl),
    relationship_reference: { host: "linkedin.com", path_digest: digest(mediaId) },
    downloadable_representation: Boolean(representationUrl),
  };
}

async function resolveGoogleMedia({ externalId, credential, expectedKind }) {
  const resource = externalId.replace(/^\/+/, "");
  if (!/^accounts\/[^/]+\/locations\/[^/]+\/(localPosts|media)\/[^/]+$/.test(resource)) {
    throw new Error("GOOGLE_PUBLICATION_RESOURCE_ID_INVALID");
  }
  const payload = await jsonRequest(
    `https://mybusiness.googleapis.com/v4/${resource}`,
    { accessToken: credential.access_token },
  );
  if (text(payload.name).replace(/^\/+/, "") !== resource) {
    throw new Error("REMOTE_MEDIA_PUBLICATION_IDENTITY_MISMATCH");
  }
  const candidates = Array.isArray(payload.media) ? payload.media : [payload];
  const selected = candidates.find((item) => {
    const format = normalized(item?.mediaFormat);
    return expectedKind === "video" ? format === "video" : expectedKind === "image" ? format === "photo" : false;
  }) || candidates[0] || null;
  const sourceUrl = text(selected?.sourceUrl) || null;
  return {
    provider: "google",
    channel: "google-business",
    remote_media_object_id: text(selected?.name) || resource,
    remote_media_kind: normalized(selected?.mediaFormat) || expectedKind || null,
    representation_url: null,
    representation_kind: sourceUrl ? "PROVIDER_SOURCE_REFERENCE" : "PROVIDER_MEDIA_OBJECT",
    representation_reference: null,
    relationship_reference: referenceIdentity(sourceUrl || selected?.googleUrl || selected?.thumbnailUrl),
    downloadable_representation: false,
    provider_source_reference_available: Boolean(sourceUrl),
    limitation: sourceUrl
      ? "GOOGLE_SOURCE_URL_IS_RELATIONSHIP_EVIDENCE_NOT_REMOTE_TRANSCODED_BYTES"
      : "GOOGLE_REMOTE_MEDIA_BYTES_NOT_EXPOSED_FOR_IDENTITY_ANALYSIS",
  };
}

async function resolveRemoteMedia({ provider, command, execution, credential, expectedKind }) {
  const externalId = text(
    execution.metadata?.external_publication_id ||
    command.metadata?.external_publication_id,
  );
  if (!externalId) throw new Error("REMOTE_PUBLICATION_ID_REQUIRED");
  const channel = targetChannel(command);
  if (provider === "meta") {
    if (channel === "instagram") {
      return resolveInstagramMedia({ externalId, credential });
    }
    if (channel === "facebook") {
      return resolveFacebookMedia({ externalId, credential, expectedKind });
    }
    throw new Error("META_REMOTE_MEDIA_CHANNEL_UNSUPPORTED");
  }
  if (provider === "linkedin") {
    return resolveLinkedInMedia({ externalId, credential, expectedKind, command });
  }
  if (provider === "google") {
    return resolveGoogleMedia({ externalId, credential, expectedKind });
  }
  throw new Error("REMOTE_MEDIA_IDENTITY_PROVIDER_UNSUPPORTED");
}

function appendCapped(chunks, state, chunk) {
  if (state.bytes >= OUTPUT_LIMIT_BYTES) return;
  const buffer = Buffer.from(chunk);
  const remaining = OUTPUT_LIMIT_BYTES - state.bytes;
  chunks.push(buffer.subarray(0, remaining));
  state.bytes += Math.min(buffer.length, remaining);
}

function run(command, args, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    const stdoutState = { bytes: 0 };
    const stderrState = { bytes: 0 };
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("REMOTE_MEDIA_IDENTITY_ANALYSIS_TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => appendCapped(stdout, stdoutState, chunk));
    child.stderr.on("data", (chunk) => appendCapped(stderr, stderrState, chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      const output = `${Buffer.concat(stdout).toString("utf8")}\n${Buffer.concat(stderr).toString("utf8")}`;
      if (code !== 0) {
        finish(new Error(output.slice(-12000) || `REMOTE_MEDIA_IDENTITY_EXIT_${code}`));
        return;
      }
      finish(null, output);
    });
  });
}

function fraction(value) {
  if (!value) return null;
  const [numerator, denominator] = String(value).split("/").map(Number);
  if (!Number.isFinite(numerator)) return null;
  if (!Number.isFinite(denominator) || denominator === 0) return numerator;
  return numerator / denominator;
}

async function probe(filePath) {
  const ffprobe = resolveCreativeFfprobePath();
  if (!ffprobe) throw new Error("FFPROBE_NOT_CONFIGURED_FOR_REMOTE_MEDIA_IDENTITY");
  const output = await run(ffprobe, [
    "-v", "error",
    "-show_format",
    "-show_streams",
    "-of", "json",
    filePath,
  ], 60000);
  const parsed = JSON.parse(output.trim());
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video") || null;
  const audio = streams.find((stream) => stream.codec_type === "audio") || null;
  return {
    media_kind: video ? "video" : audio ? "audio" : null,
    duration_seconds: finite(parsed.format?.duration ?? video?.duration ?? audio?.duration),
    width: finite(video?.width),
    height: finite(video?.height),
    frame_rate: fraction(video?.avg_frame_rate || video?.r_frame_rate),
    video_codec: video?.codec_name || null,
    audio_codec: audio?.codec_name || null,
    has_video: Boolean(video),
    has_audio: Boolean(audio),
  };
}

function parseSignature(output) {
  const source = String(output || "");
  const whole = /whole video matching/i.test(source);
  const noMatch = /no matching of video\s+0\s+and\s+1/i.test(source);
  const matches = [...source.matchAll(
    /matching of video\s+0\s+at\s+([^\s]+)\s+and\s+1\s+at\s+([^\s,]+),\s*(\d+)\s+frames matching/gi,
  )].map((match) => ({
    source_position: match[1],
    remote_position: match[2],
    matching_frames: Number(match[3]),
  }));
  return {
    whole_video_matching: whole,
    no_matching_sequence: noMatch,
    matches,
    maximum_matching_frames: matches.reduce(
      (maximum, match) => Math.max(maximum, match.matching_frames || 0),
      0,
    ),
  };
}

async function compareVideo({ sourceMedia, remoteMedia, sourceProbe, remoteProbe }) {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("FFMPEG_NOT_CONFIGURED_FOR_REMOTE_MEDIA_IDENTITY");
  const configuredMaximum = positiveNumber(
    process.env.CREATIVE_PUBLICATION_MEDIA_IDENTITY_MAX_SECONDS,
    DEFAULT_MAX_ANALYSIS_SECONDS,
  );
  const knownDurations = [sourceProbe.duration_seconds, remoteProbe.duration_seconds]
    .filter((value) => value !== null && value > 0);
  const longestDuration = knownDurations.length ? Math.max(...knownDurations) : null;
  const analysisSeconds = longestDuration
    ? Math.min(longestDuration, configuredMaximum)
    : configuredMaximum;
  const analysisCapped = Boolean(longestDuration && longestDuration > configuredMaximum);
  const filter = [
    `[0:v]trim=duration=${analysisSeconds},setpts=PTS-STARTPTS[source]`,
    `[1:v]trim=duration=${analysisSeconds},setpts=PTS-STARTPTS[remote]`,
    "[source][remote]signature=nb_inputs=2:detectmode=full",
  ].join(";");
  const output = await run(ffmpeg, [
    "-hide_banner",
    "-nostats",
    "-i", sourceMedia.file_path,
    "-i", remoteMedia.file_path,
    "-filter_complex", filter,
    "-an",
    "-f", "null",
    "-",
  ]);
  const signature = parseSignature(output);
  const sequenceMatch = signature.whole_video_matching || signature.matches.length > 0;
  const status = signature.whole_video_matching && !analysisCapped
    ? "MATCHED_FULL"
    : sequenceMatch
      ? "MATCHED_PARTIAL"
      : signature.no_matching_sequence
        ? "MISMATCHED"
        : "UNVERIFIABLE";
  return {
    method: "FFMPEG_MPEG7_VIDEO_SIGNATURE",
    status,
    perceptual_identity_verified: status === "MATCHED_FULL",
    perceptual_match_detected: sequenceMatch,
    whole_video_matching: signature.whole_video_matching,
    matching_sequence_count: signature.matches.length,
    maximum_matching_frames: signature.maximum_matching_frames,
    analysis_seconds: analysisSeconds,
    analysis_capped: analysisCapped,
    source_duration_seconds: sourceProbe.duration_seconds,
    remote_duration_seconds: remoteProbe.duration_seconds,
    source_dimensions: sourceProbe.width && sourceProbe.height
      ? `${sourceProbe.width}x${sourceProbe.height}`
      : null,
    remote_dimensions: remoteProbe.width && remoteProbe.height
      ? `${remoteProbe.width}x${remoteProbe.height}`
      : null,
    source_frame_rate: sourceProbe.frame_rate,
    remote_frame_rate: remoteProbe.frame_rate,
    limitation: analysisCapped
      ? "PERCEPTUAL_ANALYSIS_CAPPED_AT_CONFIGURED_DURATION"
      : null,
  };
}

function referenceOnlyResult({ approvedChecksum, renderId, remote }) {
  return {
    status: "REMOTE_MEDIA_REFERENCE_ONLY",
    approved_derivative_checksum: approvedChecksum,
    derivative_render_asset_node_id: renderId,
    source_checksum_verified: false,
    remote_media_object_id: remote.remote_media_object_id || null,
    remote_media_kind: remote.remote_media_kind || null,
    remote_representation_kind: remote.representation_kind || null,
    remote_representation_reference: remote.representation_reference || null,
    remote_relationship_reference: remote.relationship_reference || null,
    remote_representation_checksum: null,
    byte_identity_verified: false,
    perceptual_identity_verified: false,
    perceptual_match_detected: false,
    analysis: null,
    limitation: remote.limitation || "REMOTE_MEDIA_REPRESENTATION_UNAVAILABLE",
  };
}

async function analyzeResolvedMedia({ organization_id, command, render, remote }) {
  const approvedChecksum = text(command.metadata?.certified_derivative_checksum);
  const renderId = text(command.metadata?.final_render_asset_node_id);
  if (!approvedChecksum || !renderId || render.id !== renderId) {
    throw new Error("CERTIFIED_DERIVATIVE_MEDIA_IDENTITY_REQUIRED");
  }
  if (!remote.downloadable_representation || !remote.representation_url) {
    return referenceOnlyResult({ approvedChecksum, renderId, remote });
  }
  const maximumBytes = positiveNumber(
    process.env.CREATIVE_PUBLICATION_MEDIA_IDENTITY_MAX_BYTES,
    DEFAULT_MAX_MEDIA_BYTES,
  );
  const timeoutMs = positiveNumber(
    process.env.CREATIVE_PUBLICATION_MEDIA_IDENTITY_DOWNLOAD_TIMEOUT_MS,
    120000,
  );
  const materializationPolicy = {
    max_bytes: maximumBytes,
    timeout_ms: timeoutMs,
    max_redirects: 5,
  };
  const [sourceMedia, remoteMedia] = await Promise.all([
    materializeMedia({
      organization_id,
      url: render.url,
      file_name: render.name || "approved-derivative",
      mime_type: render.technical?.mime_type || null,
      policy: materializationPolicy,
    }),
    materializeMedia({
      organization_id,
      url: remote.representation_url,
      file_name: `remote-${remote.remote_media_object_id || "publication"}`,
      policy: materializationPolicy,
    }),
  ]);
  try {
    if (sourceMedia.checksum !== approvedChecksum) {
      throw new Error("APPROVED_DERIVATIVE_CHECKSUM_MISMATCH_AT_MEDIA_IDENTITY");
    }
    const byteIdentity = remoteMedia.checksum === approvedChecksum;
    const [sourceProbe, remoteProbe] = await Promise.all([
      probe(sourceMedia.file_path),
      probe(remoteMedia.file_path),
    ]);
    if (!sourceProbe.has_video || !remoteProbe.has_video) {
      return {
        status: byteIdentity ? "MATCHED_BYTES" : "UNSUPPORTED_MEDIA_KIND_V1",
        approved_derivative_checksum: approvedChecksum,
        derivative_render_asset_node_id: renderId,
        source_checksum_verified: true,
        remote_media_object_id: remote.remote_media_object_id || null,
        remote_media_kind: remote.remote_media_kind || null,
        remote_representation_kind: remote.representation_kind || null,
        remote_representation_reference: remote.representation_reference || null,
        remote_relationship_reference: remote.relationship_reference || null,
        remote_representation_checksum: remoteMedia.checksum,
        byte_identity_verified: byteIdentity,
        perceptual_identity_verified: byteIdentity,
        perceptual_match_detected: byteIdentity,
        analysis: null,
        limitation: byteIdentity ? null : "V1_PERCEPTUAL_IDENTITY_SUPPORTS_VIDEO_ONLY",
      };
    }
    if (byteIdentity) {
      return {
        status: "MATCHED_BYTES",
        approved_derivative_checksum: approvedChecksum,
        derivative_render_asset_node_id: renderId,
        source_checksum_verified: true,
        remote_media_object_id: remote.remote_media_object_id || null,
        remote_media_kind: remote.remote_media_kind || "video",
        remote_representation_kind: remote.representation_kind || null,
        remote_representation_reference: remote.representation_reference || null,
        remote_relationship_reference: remote.relationship_reference || null,
        remote_representation_checksum: remoteMedia.checksum,
        byte_identity_verified: true,
        perceptual_identity_verified: true,
        perceptual_match_detected: true,
        analysis: {
          method: "SHA256_EXACT_BYTES",
          status: "MATCHED_FULL",
          source_duration_seconds: sourceProbe.duration_seconds,
          remote_duration_seconds: remoteProbe.duration_seconds,
        },
        limitation: null,
      };
    }
    const analysis = await compareVideo({
      sourceMedia,
      remoteMedia,
      sourceProbe,
      remoteProbe,
    });
    return {
      status: analysis.status,
      approved_derivative_checksum: approvedChecksum,
      derivative_render_asset_node_id: renderId,
      source_checksum_verified: true,
      remote_media_object_id: remote.remote_media_object_id || null,
      remote_media_kind: remote.remote_media_kind || "video",
      remote_representation_kind: remote.representation_kind || null,
      remote_representation_reference: remote.representation_reference || null,
      remote_relationship_reference: remote.relationship_reference || null,
      remote_representation_checksum: remoteMedia.checksum,
      byte_identity_verified: false,
      perceptual_identity_verified: analysis.perceptual_identity_verified === true,
      perceptual_match_detected: analysis.perceptual_match_detected === true,
      analysis,
      limitation: analysis.limitation,
    };
  } finally {
    await Promise.allSettled([sourceMedia.cleanup(), remoteMedia.cleanup()]);
  }
}

function evidenceIdentity({ command, execution, lifecycle, result, observedAt }) {
  return digest({
    contract: CONTRACT,
    publish_command_asset_node_id: command.id,
    publish_command_identity: command.metadata?.publish_command_identity || null,
    publication_content_binding_identity:
      command.metadata?.publication_content_binding_identity || null,
    publish_execution_asset_node_id: execution.id,
    publish_execution_identity: execution.metadata?.publish_execution_identity || null,
    lifecycle_evidence_asset_node_id: lifecycle?.id || null,
    lifecycle_evidence_identity:
      lifecycle?.metadata?.publication_lifecycle_evidence_identity || null,
    approved_derivative_checksum: result.approved_derivative_checksum || null,
    remote_media_object_id: result.remote_media_object_id || null,
    remote_representation_checksum: result.remote_representation_checksum || null,
    media_identity_status: result.status,
    perceptual_identity_verified: result.perceptual_identity_verified === true,
    observed_at: observedAt,
  });
}

function currentPatch(existing, result, evidenceId, observedAt) {
  return {
    ...(existing || {}),
    publication_remote_media_identity_contract: CONTRACT,
    publication_remote_media_identity_status: result.status,
    publication_remote_media_identity_evidence_asset_node_id: evidenceId,
    publication_remote_media_object_id: result.remote_media_object_id || null,
    publication_remote_media_byte_identity_verified: result.byte_identity_verified === true,
    publication_remote_media_perceptual_identity_verified:
      result.perceptual_identity_verified === true,
    publication_remote_media_perceptual_match_detected:
      result.perceptual_match_detected === true,
    last_remote_media_identity_checked_at: observedAt,
    ...(result.status === "MISMATCHED" && !existing?.first_remote_media_mismatch_observed_at
      ? { first_remote_media_mismatch_observed_at: observedAt }
      : {}),
  };
}

async function loadContext({ organization_id, publish_command_asset_node_id }) {
  if (!organization_id) throw new Error("organization_id required");
  if (!publish_command_asset_node_id) {
    throw new Error("publish_command_asset_node_id required");
  }
  const command = await AssetGraphRepository.getById(publish_command_asset_node_id);
  if (
    !command ||
    text(command.organization_id) !== text(organization_id) ||
    command.type !== CREATIVE_ASSET_NODE_TYPES.PUBLISH_COMMAND
  ) {
    throw new Error("PUBLISH_COMMAND_REQUIRED");
  }
  const nodes = await AssetGraphRepository.listByProject({
    organization_id,
    creative_project_id: command.creative_project_id,
  });
  const execution = currentExecution(nodes, command);
  if (!execution) throw new Error("PUBLISH_EXECUTION_REQUIRED");
  const historical = historicalPublicationEvidence(nodes, command.id, execution.id);
  if (!historical) throw new Error("VERIFIED_PUBLICATION_HISTORY_REQUIRED");
  const lifecycle = lifecycleEvidence(nodes, command.id, execution.id);
  const render = nodes.find((node) =>
    node.id === command.metadata?.final_render_asset_node_id &&
    node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
  ) || null;
  if (!render?.url) throw new Error("CERTIFIED_DERIVATIVE_MEDIA_REQUIRED");
  return {
    command,
    execution,
    nodes,
    historical,
    lifecycle,
    render,
    provider: providerFor(command, execution),
  };
}

export const CreativePublicationRemoteMediaIdentityRuntime = Object.freeze({
  contract: CONTRACT,

  async inspect({ organization_id, publish_command_asset_node_id } = {}) {
    const context = await loadContext({ organization_id, publish_command_asset_node_id });
    const latest = mediaIdentityEvidence(
      context.nodes,
      context.command.id,
      context.execution.id,
    );
    return {
      contract: CONTRACT,
      command_id: context.command.id,
      execution_id: context.execution.id,
      historical_publication_evidence_id: context.historical.id,
      lifecycle_evidence_id: context.lifecycle?.id || null,
      latest_media_identity_evidence: latest,
      status:
        latest?.metadata?.media_identity_status ||
        context.command.metadata?.publication_remote_media_identity_status ||
        "NOT_CHECKED",
      remote_media_object_id:
        latest?.metadata?.remote_media_object_id ||
        context.command.metadata?.publication_remote_media_object_id ||
        null,
      byte_identity_verified:
        latest?.metadata?.byte_identity_verified === true,
      perceptual_identity_verified:
        latest?.metadata?.perceptual_identity_verified === true,
      perceptual_match_detected:
        latest?.metadata?.perceptual_match_detected === true,
      can_recheck: Boolean(
        context.provider &&
        context.lifecycle?.metadata?.current_live === true,
      ),
    };
  },

  async recheck({
    organization_id,
    publish_command_asset_node_id,
    checked_by,
  } = {}) {
    if (!checked_by?.user_id || !checked_by?.staff_account_id) {
      throw new Error("AUTHENTICATED_REMOTE_MEDIA_IDENTITY_CHECKER_REQUIRED");
    }

    await CreativePublicationLifecycleRuntime.revalidate({
      organization_id,
      publish_command_asset_node_id,
      checked_by,
    });
    const context = await loadContext({ organization_id, publish_command_asset_node_id });
    const freshLifecycle = lifecycleEvidence(
      context.nodes,
      context.command.id,
      context.execution.id,
    ) || context.lifecycle;
    const approvedChecksum = text(context.command.metadata?.certified_derivative_checksum);
    const renderId = text(context.command.metadata?.final_render_asset_node_id);

    let result;
    if (freshLifecycle?.metadata?.current_live !== true) {
      result = {
        status: freshLifecycle?.metadata?.current_live === false
          ? "NOT_LIVE"
          : "REMOTE_STATE_UNVERIFIABLE",
        approved_derivative_checksum: approvedChecksum || null,
        derivative_render_asset_node_id: renderId || null,
        source_checksum_verified: false,
        remote_media_object_id: null,
        remote_media_kind: mediaKind(context.render),
        remote_representation_kind: null,
        remote_representation_reference: null,
        remote_relationship_reference: null,
        remote_representation_checksum: null,
        byte_identity_verified: false,
        perceptual_identity_verified: false,
        perceptual_match_detected: false,
        analysis: null,
        limitation: "REMOTE_PUBLICATION_MUST_BE_CONFIRMED_LIVE_BEFORE_MEDIA_IDENTITY_ANALYSIS",
      };
    } else {
      if (!context.provider) {
        throw new Error("REMOTE_MEDIA_IDENTITY_PROVIDER_UNSUPPORTED");
      }
      const credential = await resolveProviderCredential({
        organization_id,
        provider: context.provider,
        credential_id: context.execution.metadata?.credential_id || null,
      });
      if (!credential?.access_token) {
        throw new Error("REMOTE_MEDIA_IDENTITY_CREDENTIAL_REQUIRED");
      }
      const remote = await resolveRemoteMedia({
        provider: context.provider,
        command: context.command,
        execution: context.execution,
        credential,
        expectedKind: mediaKind(context.render),
      });
      result = await analyzeResolvedMedia({
        organization_id,
        command: context.command,
        render: context.render,
        remote,
      });
    }

    const observedAt = new Date().toISOString();
    const identity = evidenceIdentity({
      command: context.command,
      execution: context.execution,
      lifecycle: freshLifecycle,
      result,
      observedAt,
    });
    const drift = result.status === "MISMATCHED";
    const evidence = createCreativeAssetNode({
      organization_id,
      creative_project_id: context.command.creative_project_id,
      parent_asset_node_id: context.execution.id,
      type: CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: `${context.command.name || "Publication"} remote media identity`,
      description: drift
        ? "Provider-accessible remote media does not match the immutable approved derivative under MPEG-7 visual signature analysis."
        : result.perceptual_identity_verified === true
          ? "Provider-accessible remote media matches the immutable approved derivative after provider transcoding under MPEG-7 visual signature analysis."
          : "Remote media identity observation. Exact source checksum remains authoritative; provider-transcoded bytes are not treated as source byte equality.",
      lineage: {
        source: "post_publication_remote_media_identity",
        provider_id: context.provider,
        capability: "creative.release.publish.remote-media-identity",
        generation_version: 1,
      },
      intelligence: {
        safety_status: drift ? "REVIEW_REQUIRED" : "UNKNOWN",
        tags: ["publication", "media-identity", "mpeg7", "transcoding", "immutable-evidence"],
      },
      reuse: { reusable: false, approved_for_reuse: false },
      review: {
        ai_reviewed: false,
        human_reviewed: true,
        approved: false,
        approved_by: null,
        notes: "Evidence observation only. A perceptual media match is not a byte-equality assertion and does not alter release approval.",
      },
      metadata: {
        contract: CONTRACT,
        observation_kind: "PUBLICATION_REMOTE_MEDIA_IDENTITY",
        publication_remote_media_identity_evidence_identity: identity,
        historical_publication_evidence_asset_node_id: context.historical.id,
        lifecycle_evidence_asset_node_id: freshLifecycle?.id || null,
        publish_command_asset_node_id: context.command.id,
        publish_command_identity: context.command.metadata?.publish_command_identity || null,
        publication_content_binding_identity:
          context.command.metadata?.publication_content_binding_identity || null,
        publish_execution_asset_node_id: context.execution.id,
        publish_execution_identity:
          context.execution.metadata?.publish_execution_identity || null,
        release_master_asset_node_id:
          context.command.metadata?.release_master_asset_node_id || null,
        release_master_checksum:
          context.command.metadata?.release_master_checksum || null,
        derivative_render_asset_node_id: result.derivative_render_asset_node_id,
        approved_derivative_checksum: result.approved_derivative_checksum,
        source_checksum_verified: result.source_checksum_verified === true,
        external_publication_id:
          context.execution.metadata?.external_publication_id ||
          context.command.metadata?.external_publication_id ||
          null,
        provider: context.provider,
        channel: targetChannel(context.command),
        remote_media_object_id: result.remote_media_object_id,
        remote_media_kind: result.remote_media_kind,
        remote_representation_kind: result.remote_representation_kind,
        remote_representation_reference: result.remote_representation_reference,
        remote_relationship_reference: result.remote_relationship_reference,
        remote_representation_checksum: result.remote_representation_checksum,
        media_identity_status: result.status,
        byte_identity_verified: result.byte_identity_verified === true,
        perceptual_identity_verified: result.perceptual_identity_verified === true,
        perceptual_match_detected: result.perceptual_match_detected === true,
        visual_signature_method: result.analysis?.method || null,
        whole_video_matching: result.analysis?.whole_video_matching === true,
        matching_sequence_count: result.analysis?.matching_sequence_count || 0,
        maximum_matching_frames: result.analysis?.maximum_matching_frames || 0,
        analysis_seconds: result.analysis?.analysis_seconds || null,
        analysis_capped: result.analysis?.analysis_capped === true,
        source_duration_seconds: result.analysis?.source_duration_seconds || null,
        remote_duration_seconds: result.analysis?.remote_duration_seconds || null,
        source_dimensions: result.analysis?.source_dimensions || null,
        remote_dimensions: result.analysis?.remote_dimensions || null,
        source_frame_rate: result.analysis?.source_frame_rate || null,
        remote_frame_rate: result.analysis?.remote_frame_rate || null,
        audio_identity_status: "NOT_EVALUATED_V1",
        limitation: result.limitation || null,
        observed_at: observedAt,
        checked_by_user_id: checked_by.user_id,
        checked_by_staff_account_id: checked_by.staff_account_id,
        not_release_approval: true,
      },
      created_by: checked_by.user_id,
    });
    const stored = await AssetGraphRepository.create(evidence);

    await AssetGraphRepository.update(context.execution.id, {
      metadata: currentPatch(
        context.execution.metadata,
        result,
        stored.id,
        observedAt,
      ),
    });
    await AssetGraphRepository.update(context.command.id, {
      metadata: currentPatch(
        context.command.metadata,
        result,
        stored.id,
        observedAt,
      ),
    });

    return {
      contract: CONTRACT,
      evidence: stored,
      status: result.status,
      byte_identity_verified: result.byte_identity_verified === true,
      perceptual_identity_verified: result.perceptual_identity_verified === true,
      perceptual_match_detected: result.perceptual_match_detected === true,
      limitation: result.limitation || null,
    };
  },
});

export const CREATIVE_PUBLICATION_REMOTE_MEDIA_IDENTITY_CONTRACT = CONTRACT;
