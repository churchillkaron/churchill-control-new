import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

import {
  getServiceSupabase,
} from "@/lib/shared/supabase/service";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as ProductionGraphRepository
from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  CreativePostProductionRuntime,
} from "./CreativePostProductionRuntime";

const supabaseAdmin = getServiceSupabase();
const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.temporal-brand-end-card.v1",
);

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

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safe(value, fallback = "end-card") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function planFor(graph = {}) {
  return object(graph.metadata?.approval_plan_snapshot);
}

function temporalPlan(graph = {}) {
  const plan = planFor(graph);
  return text(plan.workflow_kind).toUpperCase() === "TEMPORAL"
    ? plan
    : null;
}

function finalShot(plan = {}) {
  const scenes = list(plan.scenes);
  const finalScene = scenes[scenes.length - 1] || {};
  const shots = list(finalScene.shots);
  return {
    scene: finalScene,
    shot: shots[shots.length - 1] || null,
  };
}

function graphicsContract(plan = {}) {
  const resolved = finalShot(plan);
  const graphics = object(resolved.shot?.graphics);
  if (
    !resolved.shot ||
    graphics.render_text_outside_generated_pixels !== true
  ) {
    return null;
  }

  const logo = object(graphics.logo);
  const titles = list(graphics.titles)
    .map((entry) => typeof entry === "string"
      ? { text: entry }
      : object(entry))
    .filter((entry) => text(entry.text));

  if (!Object.keys(logo).length && !titles.length) return null;

  return {
    scene: resolved.scene,
    shot: resolved.shot,
    graphics,
    logo,
    titles,
  };
}

function brandManifestEntry(plan = {}) {
  return list(plan.asset_manifest).find((entry) => {
    const corpus = [
      entry.asset_type,
      entry.type,
      entry.role,
      entry.name,
      entry.description,
    ].map(text).join(" ").toLowerCase();
    return /\b(?:logo|brand[ _-]?mark)\b/.test(corpus);
  }) || null;
}

function logoIdentity(plan = {}, contract = {}) {
  const manifest = brandManifestEntry(plan);
  return text(
    contract.logo.asset_node_id ||
    contract.logo.asset_id ||
    contract.logo.creative_asset_id ||
    plan.brand_mark_profiles?.[0]?.asset_node_id ||
    plan.brand_mark_profiles?.[0]?.asset_id ||
    manifest?.asset_node_id ||
    manifest?.asset_id,
  );
}

async function resolveLogoNode({
  organization_id,
  creative_project_id,
  identity,
}) {
  if (!identity) return null;

  const direct = await AssetGraphRepository.getById(identity);
  if (direct && String(direct.organization_id) === String(organization_id)) {
    return direct;
  }

  const nodes = await AssetGraphRepository.listByProject({
    organization_id,
    creative_project_id,
  });
  return nodes.find((node) =>
    String(node.creative_asset_id || "") === String(identity),
  ) || null;
}

function dimensions(plan = {}, project = {}) {
  const output = list(plan.deliverables)
    .map((item) => object(item.output_spec))
    .find((spec) => finite(spec.width) && finite(spec.height)) || {};
  const configured = object(project.metadata?.post_production?.render);
  const width = finite(output.width, finite(configured.width));
  const height = finite(output.height, finite(configured.height));
  if (!width || !height) {
    throw new Error("TEMPORAL_END_CARD_DIMENSIONS_REQUIRED");
  }
  return { width, height };
}

function durationContract(plan = {}, contract = {}) {
  const scenes = list(plan.scenes);
  const total = scenes.reduce(
    (sum, scene) => sum + Math.max(0, finite(scene.duration_seconds, 0)),
    0,
  );
  const duration = finite(contract.shot.duration_seconds);
  if (!duration || duration <= 0 || total <= 0 || duration > total) {
    throw new Error("TEMPORAL_END_CARD_DURATION_INVALID");
  }
  return {
    total_duration_seconds: total,
    duration_seconds: duration,
    timeline_in_seconds: total - duration,
  };
}

function textSvg({ width, height, titles, graphics }) {
  const configured = object(graphics.typography);
  const fill = text(configured.fill || graphics.text_colour || "#FFFFFF");
  const fontFamily = text(configured.font_family || "Arial, sans-serif");
  const baseSize = Math.max(18, Math.round(height * 0.038));
  const gap = Math.round(baseSize * 1.5);
  const startY = Math.round(height * 0.72);

  const elements = titles.map((entry, index) => {
    const fontSize = Math.max(
      14,
      Math.round(finite(entry.font_size, baseSize)),
    );
    const weight = text(entry.font_weight || configured.font_weight || "500");
    const opacity = Math.max(0, Math.min(1, finite(entry.opacity, 1)));
    return `<text x="${Math.round(width / 2)}" y="${startY + index * gap}" ` +
      `text-anchor="middle" font-family="${escapeXml(fontFamily)}" ` +
      `font-size="${fontSize}" font-weight="${escapeXml(weight)}" ` +
      `fill="${escapeXml(fill)}" fill-opacity="${opacity}">` +
      `${escapeXml(entry.text)}</text>`;
  }).join("");

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      elements +
    `</svg>`,
  );
}

async function renderEndCard({
  logo,
  logoMaterial,
  contract,
  dimensions: canvas,
  outputPath,
}) {
  const background = text(
    contract.graphics.background ||
    contract.graphics.background_colour ||
    "#080808",
  );
  const logoWidth = Math.max(
    64,
    Math.round(finite(contract.logo.width, canvas.width * 0.46)),
  );
  const logoHeight = Math.max(
    64,
    Math.round(finite(contract.logo.height, canvas.height * 0.42)),
  );
  const logoBuffer = logoMaterial
    ? await sharp(logoMaterial.file_path, { failOn: "none" })
        .rotate()
        .resize({
          width: logoWidth,
          height: logoHeight,
          fit: "contain",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer()
    : null;

  const overlays = [];
  if (logoBuffer) {
    overlays.push({
      input: logoBuffer,
      left: Math.round((canvas.width - logoWidth) / 2),
      top: Math.round(canvas.height * 0.16),
      blend: "over",
    });
  }
  if (contract.titles.length) {
    overlays.push({
      input: textSvg({
        width: canvas.width,
        height: canvas.height,
        titles: contract.titles,
        graphics: contract.graphics,
      }),
      left: 0,
      top: 0,
      blend: "over",
    });
  }

  await sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      background,
    },
  })
    .composite(overlays)
    .png()
    .toFile(outputPath);

  return {
    exact_logo_asset_node_id: logo?.id || null,
    exact_logo_creative_asset_id: logo?.creative_asset_id || null,
  };
}

async function upload({
  organization_id,
  creative_project_id,
  outputPath,
  identity,
}) {
  const bucket =
    process.env.CREATIVE_STILL_RENDER_BUCKET ||
    process.env.CREATIVE_MEDIA_RENDER_BUCKET ||
    null;
  if (!bucket) throw new Error("TEMPORAL_END_CARD_STORAGE_BUCKET_REQUIRED");

  const buffer = await fs.readFile(outputPath);
  const storagePath = [
    safe(organization_id),
    safe(creative_project_id),
    "overlays",
    "temporal-end-card",
    `${identity}.png`,
  ].join("/");
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType: "image/png",
      upsert: false,
    });
  if (error && error.statusCode !== "409" && error.status !== 409) throw error;

  return {
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
    mime_type: "image/png",
    file_size_bytes: buffer.length,
    checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

export async function ensureTemporalBrandEndCard({
  organization_id,
  creative_project_id,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const [project, graphs, nodes] = await Promise.all([
    CreativeProjectRepository.getById(creative_project_id),
    ProductionGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    }),
    AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    }),
  ]);
  if (!project || String(project.organization_id) !== String(organization_id)) {
    throw new Error("Creative project not found");
  }

  const graph = graphs.find((candidate) =>
    candidate.status === "APPROVED" && temporalPlan(candidate),
  ) || graphs.find((candidate) => temporalPlan(candidate)) || null;
  if (!graph) return null;

  const plan = temporalPlan(graph);
  const contract = graphicsContract(plan);
  if (!contract) return null;

  const logoId = logoIdentity(plan, contract);
  const logo = logoId
    ? await resolveLogoNode({
        organization_id,
        creative_project_id,
        identity: logoId,
      })
    : null;
  if (Object.keys(contract.logo).length && !logo?.url) {
    throw new Error("TEMPORAL_END_CARD_EXACT_LOGO_ASSET_REQUIRED");
  }

  const canvas = dimensions(plan, project);
  const timing = durationContract(plan, contract);
  const identity = crypto.createHash("sha256").update(JSON.stringify({
    graph_id: graph.id,
    graph_hash: graph.metadata?.approved_graph_hash || graph.metadata?.graph_hash,
    plan_hash: graph.metadata?.approved_plan_hash || graph.metadata?.plan_hash,
    shot_id: contract.shot.id,
    canvas,
    timing,
    logo_asset_node_id: logo?.id || null,
    logo_checksum: logo?.technical?.checksum || null,
    titles: contract.titles,
    graphics: contract.graphics,
  })).digest("hex");

  const existing = nodes.find((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.IMAGE &&
    node.metadata?.temporal_end_card_identity === identity &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
  );
  if (existing) return existing;

  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "avantiqo-temporal-end-card-"),
  );
  const outputPath = path.join(directory, `${identity}.png`);
  let logoMaterial = null;
  try {
    if (logo?.url) {
      logoMaterial = await materializeMedia({
        url: logo.url,
        file_name: logo.name || null,
        mime_type: logo.technical?.mime_type || null,
        organization_id,
        policy: project.metadata?.post_production?.render || {},
      });
    }
    const evidence = await renderEndCard({
      logo,
      logoMaterial,
      contract,
      dimensions: canvas,
      outputPath,
    });
    const uploaded = await upload({
      organization_id,
      creative_project_id,
      outputPath,
      identity,
    });

    return AssetGraphRepository.create(createCreativeAssetNode({
      organization_id,
      creative_project_id,
      parent_asset_node_id: logo?.id || null,
      type: CREATIVE_ASSET_NODE_TYPES.IMAGE,
      status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
      name: `${project.name || "Creative production"} deterministic end card`,
      description:
        "Deterministic exact-brand end card rendered outside generated provider pixels.",
      url: uploaded.url,
      storage_path: uploaded.storage_path,
      lineage: {
        source: "deterministic_temporal_brand_composition",
        capability: "creative.temporal.end-card.compose",
        generation_version: 1,
      },
      technical: {
        mime_type: uploaded.mime_type,
        media_kind: "IMAGE",
        width: canvas.width,
        height: canvas.height,
        checksum: uploaded.checksum,
        file_size_bytes: uploaded.file_size_bytes,
      },
      reuse: {
        reusable: false,
        approved_for_reuse: false,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: false,
        approved: false,
        notes: "Generated deterministically from the approved plan and exact brand asset.",
      },
      metadata: {
        temporal_end_card_contract:
          "CREATIVE_TEMPORAL_DETERMINISTIC_END_CARD_V1",
        temporal_end_card_identity: identity,
        production_graph_id: graph.id,
        source_shot_id: contract.shot.id || null,
        render_role: "OVERLAY",
        include_as_overlay: true,
        include_in_master: true,
        timeline_in_seconds: timing.timeline_in_seconds,
        duration_seconds: timing.duration_seconds,
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
        opacity: 1,
        render_text_outside_generated_pixels: true,
        exact_brand_assets_applied: Boolean(logo?.id),
        exact_logo_asset_node_id: evidence.exact_logo_asset_node_id,
        exact_logo_creative_asset_id:
          evidence.exact_logo_creative_asset_id,
        titles: contract.titles,
      },
    }));
  } finally {
    await logoMaterial?.cleanup?.().catch(() => null);
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function install() {
  if (CreativePostProductionRuntime[INSTALL_FLAG]) return;
  const runWithoutEndCard =
    CreativePostProductionRuntime.run.bind(CreativePostProductionRuntime);

  Object.defineProperty(CreativePostProductionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativePostProductionRuntime.run =
    async function runWithDeterministicTemporalEndCard(input = {}) {
      await ensureTemporalBrandEndCard(input);
      return runWithoutEndCard(input);
    };
}

install();

export const CreativeTemporalBrandEndCardRuntime = {
  installed: true,
  ensure: ensureTemporalBrandEndCard,
};
