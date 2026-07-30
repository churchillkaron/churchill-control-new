import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  materializeMedia,
  CreativeMediaInspectionRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

const supabaseAdmin = getServiceSupabase();
const ANGLE_PRIORITY = Object.freeze([
  "FRONT",
  "LEFT_THREE_QUARTER",
  "RIGHT_THREE_QUARTER",
  "LEFT_PROFILE",
  "RIGHT_PROFILE",
  "FULL_BODY",
  "PERFORMANCE_BODY",
  "FACE_DETAIL",
  "HALF_BODY",
  "THREE_QUARTER_BODY",
  "UNCLASSIFIED",
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeSegment(value, fallback = "identity-atlas") {
  const normalized = text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

function assetId(asset = {}) {
  return text(asset.id || asset.asset_id);
}

function assetUrl(asset = {}) {
  return asset.url || asset.file_url || asset.image_url || null;
}

function assetMime(asset = {}) {
  return text(
    asset.mime_type ||
    asset.technical?.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.technical?.mime_type,
  ).toLowerCase();
}

function assetKind(asset = {}) {
  const mime = assetMime(asset);
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const source = text(assetUrl(asset)).toLowerCase();
  if (mime.startsWith("video/") || type.includes("video") || /\.(mp4|mov|m4v|webm|mkv)(\?|$)/.test(source)) {
    return "VIDEO";
  }
  if (mime.startsWith("image/") || type.includes("image") || /\.(jpg|jpeg|png|webp|heic|avif)(\?|$)/.test(source)) {
    return "IMAGE";
  }
  return "OTHER";
}

function qualityScore(reference = {}, asset = {}) {
  return finite(reference.quality?.score) ??
    finite(asset.analysis?.quality_score) ??
    finite(asset.intelligence?.quality_score) ??
    0;
}

function referenceAngles(reference = {}) {
  return list(reference.angles).map((value) => text(value).toUpperCase());
}

function referenceRank(reference = {}, asset = {}) {
  const angles = referenceAngles(reference);
  const priority = Math.min(
    ...angles.map((angle) => {
      const index = ANGLE_PRIORITY.indexOf(angle);
      return index >= 0 ? index : ANGLE_PRIORITY.length;
    }),
    ANGLE_PRIORITY.length,
  );
  return priority * 1000 - qualityScore(reference, asset);
}

function selectedReferences(profile = {}, assetMap = new Map(), maximum = 6) {
  const references = list(profile.references)
    .map((reference) => ({
      ...reference,
      asset: assetMap.get(text(reference.asset_id)) || null,
    }))
    .filter((reference) => reference.asset && assetUrl(reference.asset))
    .sort((left, right) =>
      referenceRank(left, left.asset) - referenceRank(right, right.asset),
    );

  const selected = [];
  const represented = new Set();
  for (const angle of ANGLE_PRIORITY) {
    const candidate = references.find((reference) =>
      !selected.some((item) => item.asset_id === reference.asset_id) &&
      referenceAngles(reference).includes(angle),
    );
    if (!candidate) continue;
    selected.push(candidate);
    represented.add(angle);
    if (selected.length >= maximum) break;
  }
  for (const reference of references) {
    if (selected.length >= maximum) break;
    if (selected.some((item) => item.asset_id === reference.asset_id)) continue;
    selected.push(reference);
  }

  return {
    references: selected,
    represented_angles: [...represented],
  };
}

function atlasHash(profile = {}, references = []) {
  return crypto.createHash("sha256").update(JSON.stringify({
    contract: "IDENTITY_ATLAS_V1",
    profile_id: profile.id,
    identity_key: profile.identity_key,
    references: references.map((reference) => ({
      asset_id: reference.asset_id,
      angles: referenceAngles(reference),
      quality: reference.quality || {},
      checksum:
        reference.asset?.technical?.checksum ||
        reference.asset?.technical?.checksum_sha256 ||
        reference.asset?.analysis?.technical?.checksum ||
        reference.asset?.metadata?.checksum ||
        null,
    })),
  })).digest("hex");
}

function runProcess(command, args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const stderr = [];
    let settled = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          if (!settled) {
            settled = true;
            reject(new Error("IDENTITY_ATLAS_VIDEO_FRAME_TIMEOUT"));
          }
        }, timeoutMs)
      : null;

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `IDENTITY_ATLAS_VIDEO_FRAME_EXIT_${code}`,
        ));
        return;
      }
      resolve();
    });
  });
}

function preferredVideoTimestamp(asset = {}, reference = {}) {
  return finite(
    reference.best_frame_seconds ||
    reference.timestamp_seconds ||
    asset.analysis?.identity_best_frame_seconds ||
    asset.analysis?.best_frame_seconds ||
    asset.metadata?.identity_best_frame_seconds,
  ) ?? 0.5;
}

async function imagePathForReference({
  organizationId,
  reference,
  directory,
  policy,
}) {
  const asset = reference.asset;
  const materialized = await materializeMedia({
    url: assetUrl(asset),
    file_name: asset.file_name || asset.name || asset.title || null,
    mime_type: assetMime(asset) || null,
    organization_id: organizationId,
    policy,
  });

  if (assetKind(asset) === "IMAGE") {
    return {
      path: materialized.file_path,
      cleanup: materialized.cleanup,
    };
  }
  if (assetKind(asset) !== "VIDEO") {
    await materialized.cleanup();
    throw new Error(`IDENTITY_ATLAS_REFERENCE_MEDIA_UNSUPPORTED:${reference.asset_id}`);
  }

  const ffmpegPath = policy.ffmpeg_path ||
    policy.ffmpegPath ||
    process.env.CREATIVE_MEDIA_FFMPEG_PATH ||
    null;
  if (!ffmpegPath) {
    await materialized.cleanup();
    throw new Error("FFMPEG_NOT_CONFIGURED_FOR_IDENTITY_ATLAS_VIDEO_REFERENCE");
  }
  const outputPath = path.join(
    directory,
    `${safeSegment(reference.asset_id)}-frame.png`,
  );
  await runProcess(ffmpegPath, [
    "-y",
    "-ss", String(preferredVideoTimestamp(asset, reference)),
    "-i", materialized.file_path,
    "-frames:v", "1",
    "-vf", "scale='min(1600,iw)':-2",
    outputPath,
  ], finite(policy.timeout_ms || policy.timeoutMs) || 60000);

  return {
    path: outputPath,
    cleanup: materialized.cleanup,
  };
}

function faceBox(asset = {}) {
  const analysis = object(asset.analysis);
  const faces = list(
    analysis.faces ||
    analysis.face_annotations ||
    analysis.faceAnnotations ||
    analysis.vision?.faces,
  );
  const face = faces
    .map((candidate) => {
      const box = object(
        candidate.bounding_box ||
        candidate.boundingBox ||
        candidate.box ||
        candidate.bounds,
      );
      const width = finite(box.width ?? box.w);
      const height = finite(box.height ?? box.h);
      const left = finite(box.left ?? box.x ?? box.x_min);
      const top = finite(box.top ?? box.y ?? box.y_min);
      return { width, height, left, top };
    })
    .filter((box) => box.width && box.height)
    .sort((left, right) => right.width * right.height - left.width * left.height)[0] || null;
  return face;
}

async function makeTile(inputPath, asset, size = 512) {
  const metadata = await sharp(inputPath, { failOn: "none" }).metadata();
  const width = finite(metadata.width);
  const height = finite(metadata.height);
  const box = faceBox(asset);
  let pipeline = sharp(inputPath, { failOn: "none" }).rotate();

  if (box && width && height) {
    const normalized = box.width <= 1 && box.height <= 1;
    const rawLeft = normalized ? box.left * width : box.left;
    const rawTop = normalized ? box.top * height : box.top;
    const rawWidth = normalized ? box.width * width : box.width;
    const rawHeight = normalized ? box.height * height : box.height;
    const expansion = 1.9;
    const cropWidth = Math.min(width, Math.max(rawWidth * expansion, rawWidth));
    const cropHeight = Math.min(height, Math.max(rawHeight * expansion, rawHeight));
    const centreX = rawLeft + rawWidth / 2;
    const centreY = rawTop + rawHeight / 2 + rawHeight * 0.12;
    const left = Math.max(0, Math.min(width - cropWidth, centreX - cropWidth / 2));
    const top = Math.max(0, Math.min(height - cropHeight, centreY - cropHeight / 2));
    pipeline = pipeline.extract({
      left: Math.round(left),
      top: Math.round(top),
      width: Math.max(1, Math.round(cropWidth)),
      height: Math.max(1, Math.round(cropHeight)),
    });
  }

  return pipeline
    .resize(size, size, {
      fit: "cover",
      position: "attention",
      withoutEnlargement: false,
    })
    .flatten({ background: "#202020" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function createAtlasBuffer({ organizationId, references, policy }) {
  const columns = 3;
  const rows = 2;
  const tileSize = 512;
  const gutter = 8;
  const width = columns * tileSize + (columns - 1) * gutter;
  const height = rows * tileSize + (rows - 1) * gutter;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-identity-atlas-"));
  const cleanups = [];

  try {
    const composites = [];
    for (const [index, reference] of references.entries()) {
      const materialized = await imagePathForReference({
        organizationId,
        reference,
        directory,
        policy,
      });
      cleanups.push(materialized.cleanup);
      const tile = await makeTile(materialized.path, reference.asset, tileSize);
      composites.push({
        input: tile,
        left: (index % columns) * (tileSize + gutter),
        top: Math.floor(index / columns) * (tileSize + gutter),
      });
    }

    if (!composites.length) throw new Error("IDENTITY_ATLAS_USABLE_REFERENCES_REQUIRED");
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: "#111111",
      },
    })
      .composite(composites)
      .png({ compressionLevel: 9 })
      .toBuffer();
  } finally {
    for (const cleanup of cleanups) await cleanup().catch(() => null);
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function uploadAtlas({ organizationId, projectId, profile, hash, content, policy }) {
  const bucket = policy.bucket ||
    policy.identity_atlas_bucket ||
    policy.identityAtlasBucket ||
    process.env.CREATIVE_IDENTITY_ATLAS_BUCKET ||
    process.env.CREATIVE_MEDIA_DERIVATIVE_BUCKET ||
    null;
  if (!bucket) throw new Error("IDENTITY_ATLAS_STORAGE_BUCKET_REQUIRED");
  const storagePath = [
    safeSegment(organizationId),
    "identity-atlases",
    safeSegment(projectId),
    safeSegment(profile.id),
    hash,
    "identity-atlas.png",
  ].join("/");
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, content, {
      contentType: "image/png",
      cacheControl: "3600",
      upsert: false,
    });
  if (error && !/already exists|duplicate/i.test(error.message || "")) throw error;
  return {
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
  };
}

function atlasPromptContract(profile = {}, atlas = {}) {
  return {
    contract: "IDENTITY_ATLAS_V1",
    identity_profile_id: profile.id,
    identity_key: profile.identity_key,
    identity_atlas_asset_node_id: atlas.asset_node_id,
    identity_atlas_url: atlas.url,
    identity_atlas_hash: atlas.hash,
    reference_asset_ids: atlas.reference_asset_ids,
    represented_angles: atlas.represented_angles,
    background_reference_policy: "EXCLUDE",
    preserve_face: true,
    preserve_body_proportions: true,
    use_atlas_as_identity_evidence_not_scene_layout: true,
    human_review_required: true,
  };
}

function shotHasPerson(shot = {}) {
  const source = JSON.stringify({
    actors: shot.actors,
    subject: shot.subject,
    action: shot.action,
    performance: shot.performance,
    identity_requirements: shot.identity_requirements,
  }).toLowerCase();
  return list(shot.actors).length > 0 ||
    /\b(person|people|artist|performer|singer|actor|actress|model|dancer|staff|employee|founder|owner|woman|man|girl|boy|face|portrait)\b/.test(source);
}

function videoGeneration(shot = {}) {
  const service = text(
    shot.generation?.capability ||
    shot.generation?.service ||
    shot.capability ||
    shot.service_id,
  ).toLowerCase();
  return service.includes("video");
}

function profileForShot(shot = {}, profiles = []) {
  const profileId = text(
    shot.identity_requirements?.profile_id ||
    shot.performance_contract?.identity_profile_id ||
    shot.generation?.identity_lock?.identity_profile_id ||
    shot.metadata?.identity_profile_id,
  );
  if (profileId) {
    const exact = profiles.find((profile) => profile.id === profileId);
    if (exact) return exact;
  }
  return profiles.length === 1 ? profiles[0] : null;
}

export const CreativeIdentityAtlasRuntime = {
  async materialize({
    organization_id,
    creative_project_id,
    profiles = [],
    assets = [],
    policy = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    const assetMap = new Map(list(assets).map((asset) => [assetId(asset), asset]));
    const existing = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });
    const outputProfiles = [];
    const created = [];
    const reused = [];

    for (const profile of list(profiles)) {
      const selected = selectedReferences(
        profile,
        assetMap,
        Math.max(1, Math.min(6, finite(policy.maximum_references) || 6)),
      );
      if (!selected.references.length) {
        throw new Error(`IDENTITY_ATLAS_REFERENCES_REQUIRED:${profile.id}`);
      }
      const hash = atlasHash(profile, selected.references);
      let node = existing.find((candidate) =>
        candidate.metadata?.contract === "IDENTITY_ATLAS_V1" &&
        candidate.metadata?.identity_atlas_hash === hash &&
        candidate.metadata?.identity_profile_id === profile.id &&
        candidate.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED,
      ) || null;

      if (!node) {
        const content = await createAtlasBuffer({
          organizationId: organization_id,
          references: selected.references,
          policy,
        });
        const uploaded = await uploadAtlas({
          organizationId: organization_id,
          projectId: creative_project_id,
          profile,
          hash,
          content,
          policy,
        });
        const inspection = await CreativeMediaInspectionRuntime.inspect({
          url: uploaded.url,
          file_name: "identity-atlas.png",
          mime_type: "image/png",
          organization_id,
          policy,
        });
        node = await AssetGraphRepository.create(createCreativeAssetNode({
          organization_id,
          creative_project_id,
          type: CREATIVE_ASSET_NODE_TYPES.IMAGE,
          status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
          name: `${profile.display_name || profile.id} identity atlas`,
          description: "Deterministic multi-angle identity evidence atlas. Reference backgrounds are excluded from story direction.",
          url: uploaded.url,
          storage_path: uploaded.storage_path,
          lineage: {
            source: "identity_atlas",
            provider_id: null,
            capability: "creative.identity.atlas",
            generation_version: 1,
          },
          technical: {
            ...(inspection.technical || {}),
            mime_type: "image/png",
            checksum:
              inspection.technical?.checksum_sha256 ||
              inspection.technical?.checksum ||
              hash,
          },
          intelligence: {
            quality_score: profile.confidence || null,
            safety_status: "UNKNOWN",
            tags: [
              "identity-atlas",
              "multi-angle",
              "background-excluded",
              `identity-profile:${profile.id}`,
            ],
            detected_people: [{
              identity_profile_id: profile.id,
              identity_key: profile.identity_key,
              represented_angles: selected.represented_angles,
            }],
          },
          reuse: {
            reusable: true,
            approved_for_reuse: false,
          },
          review: {
            ai_reviewed: false,
            human_reviewed: false,
            approved: false,
            notes: "Human approval is required before this atlas may authorize paid identity-driven generation.",
          },
          metadata: {
            contract: "IDENTITY_ATLAS_V1",
            identity_profile_id: profile.id,
            identity_key: profile.identity_key,
            identity_atlas_hash: hash,
            reference_asset_ids: selected.references.map((reference) => reference.asset_id),
            represented_angles: selected.represented_angles,
            background_reference_policy: "EXCLUDE",
            human_approval_required: true,
            inspection_status: inspection.status,
            inspection_reason: inspection.reason,
            bucket: uploaded.bucket,
          },
        }));
        created.push(node);
      } else {
        reused.push(node);
      }

      const atlas = {
        contract: "IDENTITY_ATLAS_V1",
        asset_node_id: node.id,
        url: node.url,
        hash,
        status: node.review?.approved === true
          ? "APPROVED"
          : "CREATED_PENDING_REVIEW",
        reference_asset_ids: selected.references.map((reference) => reference.asset_id),
        represented_angles: selected.represented_angles,
        human_review_required: true,
        human_approved: node.review?.approved === true,
      };
      outputProfiles.push({
        ...profile,
        identity_atlas: atlas,
        identity_atlas_contract: atlasPromptContract(profile, atlas),
      });
    }

    return {
      contract: "IDENTITY_ATLAS_MATERIALIZATION_V1",
      profiles: outputProfiles,
      atlases: outputProfiles.map((profile) => profile.identity_atlas),
      created,
      reused,
      all_materialized: outputProfiles.length === list(profiles).length,
      human_approval_required: outputProfiles.length > 0,
    };
  },

  attachToPlan(plan = {}, materialization = {}) {
    const profiles = list(materialization.profiles);
    const scenes = list(plan.scenes).map((scene) => ({
      ...scene,
      shots: list(scene.shots).map((shot) => {
        if (!shotHasPerson(shot)) return shot;
        const profile = profileForShot(shot, profiles);
        if (!profile?.identity_atlas?.url) {
          throw new Error(`IDENTITY_ATLAS_SHOT_PROFILE_REQUIRED:${shot.id || shot.title || "unknown"}`);
        }
        const atlas = profile.identity_atlas;
        const identityAtlasContract = atlasPromptContract(profile, atlas);
        const keyframeRequired = videoGeneration(shot);
        const keyframeId = `${shot.id}:identity-keyframe`;
        return {
          ...shot,
          reference_asset_ids: [
            ...new Set([
              ...list(shot.reference_asset_ids),
              ...list(profile.reference_asset_ids),
            ]),
          ],
          identity_requirements: {
            ...object(shot.identity_requirements),
            profile_id: profile.id,
            identity_atlas_asset_node_id: atlas.asset_node_id,
            identity_atlas_url: atlas.url,
            identity_atlas_hash: atlas.hash,
            identity_atlas_contract: identityAtlasContract,
            atlas_human_approval_required: true,
            background_reference_policy: "EXCLUDE",
            verification_required: true,
          },
          keyframe_contract: keyframeRequired ? {
            contract: "IDENTITY_STORY_KEYFRAME_V1",
            id: keyframeId,
            required: true,
            service: "ai.image.generate",
            capability: "ai.image.generate",
            identity_profile_id: profile.id,
            identity_atlas_asset_node_id: atlas.asset_node_id,
            identity_atlas_url: atlas.url,
            identity_atlas_hash: atlas.hash,
            reference_images: [
              { url: atlas.url, role: "IDENTITY_ATLAS" },
              ...list(profile.references)
                .filter((reference) => reference.asset?.url)
                .slice(0, 5)
                .map((reference) => ({
                  url: reference.asset.url,
                  asset_id: reference.asset_id,
                  role: "IDENTITY_ANGLE_REFERENCE",
                })),
            ],
            input_fidelity: "high",
            output_spec: {
              size: "1536x1024",
              quality: "high",
              format: "png",
            },
            prompt: [
              `Create the exact opening story keyframe for shot ${shot.id || shot.title}.`,
              `Preserve the exact real person represented by identity profile ${profile.id} and the supplied multi-angle atlas.`,
              "The atlas is identity evidence only. Do not copy its grid, panels, backgrounds, poses, lighting or framing into the result.",
              `Shot purpose: ${text(shot.purpose)}.`,
              `Visible subject: ${text(shot.subject)}.`,
              `Opening frame: ${text(shot.frame_plan?.opening_frame || shot.opening_frame?.description || shot.opening_frame)}.`,
              `Action beginning: ${text(shot.action)}.`,
              `Camera: ${JSON.stringify(shot.camera || {})}.`,
              `Lighting: ${JSON.stringify(shot.lighting || {})}.`,
              `Production design: ${JSON.stringify(shot.production_design || {})}.`,
              "Do not alter facial geometry, eyes, nose, lips, jawline, skin tone, age, hairline, body type or body proportions. No generic lookalike, no duplicate subject, no synthetic skin and no text or watermark.",
            ].join("\n\n"),
            validation: {
              required: true,
              service: "ai.image.analyze",
              capability: "ai.image.analyze",
              minimum_identity_score: 90,
              minimum_story_score: 85,
              minimum_total_score: 88,
              compare_against_identity_atlas: true,
              compare_against_all_relevant_angles: true,
              human_approval_required_before_video: true,
            },
          } : object(shot.keyframe_contract),
          generation: {
            ...object(shot.generation),
            identity_lock: {
              ...object(shot.generation?.identity_lock),
              required: true,
              identity_profile_id: profile.id,
              identity_atlas_asset_node_id: atlas.asset_node_id,
              identity_atlas_url: atlas.url,
              identity_atlas_hash: atlas.hash,
              reference_asset_node_id: atlas.asset_node_id,
              reference_asset_node_ids: [
                atlas.asset_node_id,
                ...list(shot.generation?.identity_lock?.reference_asset_node_ids),
              ],
              background_reference_policy: "EXCLUDE",
              verification_required: true,
            },
            provider_parameters: {
              ...object(shot.generation?.provider_parameters),
              identity_atlas_asset_node_id: atlas.asset_node_id,
              identity_atlas_url: atlas.url,
              identity_atlas_hash: atlas.hash,
              identity_keyframe_required: keyframeRequired,
              identity_keyframe_node_id: keyframeRequired ? keyframeId : null,
            },
          },
          metadata: {
            ...object(shot.metadata),
            identity_atlas_asset_node_id: atlas.asset_node_id,
            identity_atlas_hash: atlas.hash,
            identity_keyframe_node_id: keyframeRequired ? keyframeId : null,
          },
        };
      }),
    }));

    return {
      ...plan,
      scenes,
      identity_profiles: profiles,
      identity_atlases: materialization.atlases,
      identity_atlas_materialization: {
        contract: materialization.contract,
        atlas_count: materialization.atlases.length,
        all_materialized: materialization.all_materialized,
        human_approval_required: materialization.human_approval_required,
      },
      production: {
        ...object(plan.production),
        identity_atlas_required: profiles.length > 0,
        identity_atlas_human_approval_required: profiles.length > 0,
        identity_story_keyframe_required_before_video: true,
        identity_story_keyframe_validation_required: true,
        identity_story_keyframe_human_approval_required_before_video: true,
      },
      validation_summary: {
        ...object(plan.validation_summary),
        identity_profile_count: profiles.length,
        identity_atlas_count: materialization.atlases.length,
        identity_atlas_all_materialized: materialization.all_materialized,
      },
    };
  },
};
