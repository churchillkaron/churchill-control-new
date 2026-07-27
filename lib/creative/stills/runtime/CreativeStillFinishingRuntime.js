import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { creativeStorageUri } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  materializeMedia,
  CreativeMediaInspectionRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as ProductionTaskRepository from "@/lib/operations/tasks/repositories/ProductionTaskRepository";
import {
  explicitStillQualityPass,
  resolveCanvasMetric,
  resolveStillDesign,
  stillOutputUrl,
  stillQualityFailures,
  unwrapStillOutput,
} from "./StillDesignContractRuntime";

const supabaseAdmin = getServiceSupabase();

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function safe(value, fallback = "still") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function mime(format) {
  return ({ jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" })[format];
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(value, maximumCharacters) {
  const words = text(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maximumCharacters) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function textSvg(layer, variant) {
  const x = resolveCanvasMetric(layer.x, variant.width, 0);
  const y = resolveCanvasMetric(layer.y, variant.height, 0);
  const width = resolveCanvasMetric(layer.width, variant.width, variant.width - x);
  const fontSize = Math.max(8, resolveCanvasMetric(layer.font_size, variant.height, 48));
  const lineHeight = Math.max(1, Number(layer.line_height || 1.15)) * fontSize;
  const characterWidth = Math.max(1, fontSize * 0.56 + Number(layer.letter_spacing || 0));
  const maximumCharacters = Math.max(1, Math.floor(width / characterWidth));
  const lines = wrapText(layer.text, maximumCharacters);
  const anchor = layer.align === "center" ? "middle" : layer.align === "right" ? "end" : "start";
  const anchorX = layer.align === "center" ? x + width / 2 : layer.align === "right" ? x + width : x;
  const tspans = lines.map((line, index) =>
    `<tspan x="${anchorX}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
  ).join("");
  return Buffer.from(
    `<svg width="${variant.width}" height="${variant.height}" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="${anchorX}" y="${y + fontSize}" text-anchor="${anchor}" ` +
      `font-family="${escapeXml(layer.font_family)}" font-size="${fontSize}" ` +
      `font-weight="${escapeXml(layer.font_weight)}" fill="${escapeXml(layer.fill)}" ` +
      `fill-opacity="${layer.opacity}" letter-spacing="${layer.letter_spacing}">${tspans}</text></svg>`,
  );
}

async function projectTasks(task) {
  return ProductionTaskRepository.listByProject({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
}

function dependencyTasks(task, tasks) {
  const dependencies = new Set(list(task.depends_on));
  return tasks.filter((candidate) => dependencies.has(candidate.id));
}

function generatedSourceTask(task, tasks) {
  return dependencyTasks(task, tasks).find((candidate) => stillOutputUrl(candidate.output)) || null;
}

async function materializeLogoLayers(task, design, policy) {
  const materials = [];
  for (const layer of design.logo_layers) {
    if (!layer.asset_id) {
      if (layer.required) throw new Error(`CREATIVE_STILL_LOGO_ASSET_REQUIRED:${layer.id}`);
      continue;
    }
    const node = await AssetGraphRepository.getById(layer.asset_id);
    if (!node || node.organization_id !== task.organization_id || !node.url) {
      if (layer.required) throw new Error(`CREATIVE_STILL_LOGO_ASSET_NOT_FOUND:${layer.asset_id}`);
      continue;
    }
    const material = await materializeMedia({
      url: node.url,
      file_name: node.name || null,
      mime_type: node.technical?.mime_type || null,
      organization_id: task.organization_id,
      policy,
    });
    materials.push({ layer, node, material });
  }
  return materials;
}

async function renderVariant({ sourcePath, logos, design, variant, outputPath }) {
  const overlays = [];
  for (const item of logos) {
    const width = resolveCanvasMetric(item.layer.width, variant.width, null);
    const height = resolveCanvasMetric(item.layer.height, variant.height, null);
    const input = await sharp(item.material.file_path, { failOn: "none" })
      .resize({ width, height, fit: item.layer.fit || "contain" })
      .png()
      .toBuffer();
    overlays.push({
      input,
      left: resolveCanvasMetric(item.layer.x, variant.width, 0),
      top: resolveCanvasMetric(item.layer.y, variant.height, 0),
      blend: "over",
    });
  }
  for (const layer of design.text_layers) {
    overlays.push({ input: textSvg(layer, variant), left: 0, top: 0, blend: "over" });
  }

  let pipeline = sharp(sourcePath, { failOn: "none" })
    .rotate()
    .resize({
      width: variant.width,
      height: variant.height,
      fit: variant.fit,
      position: variant.position,
      background: variant.background,
      withoutEnlargement: variant.without_enlargement,
    })
    .composite(overlays);
  if (variant.format === "jpg") pipeline = pipeline.jpeg({ quality: variant.quality });
  else if (variant.format === "png") pipeline = pipeline.png({ quality: variant.quality });
  else if (variant.format === "webp") pipeline = pipeline.webp({ quality: variant.quality });
  else if (variant.format === "avif") pipeline = pipeline.avif({ quality: variant.quality });
  await pipeline.toFile(outputPath);
}

async function upload({ task, variant, outputPath, identity }) {
  const bucket = task.input?.storage_policy?.bucket || task.metadata?.storage_policy?.bucket ||
    process.env.CREATIVE_STILL_RENDER_BUCKET || process.env.CREATIVE_MEDIA_RENDER_BUCKET || null;
  if (!bucket) throw new Error("CREATIVE_STILL_STORAGE_BUCKET_REQUIRED");
  const buffer = await fs.readFile(outputPath);
  const storagePath = [
    safe(task.organization_id),
    safe(task.creative_project_id),
    "stills",
    safe(task.metadata?.deliverable_id || task.id),
    `${identity}-${variant.id}.${variant.format}`,
  ].join("/");
  const contentType = mime(variant.format);
  const { error } = await supabaseAdmin.storage.from(bucket).upload(storagePath, buffer, {
    contentType,
    upsert: false,
  });
  if (error && error.statusCode !== "409" && error.status !== 409) throw error;
  return {
    id: variant.id,
    name: variant.name,
    channel: variant.channel,
    width: variant.width,
    height: variant.height,
    format: variant.format,
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
    mime_type: contentType,
    file_size_bytes: buffer.length,
    checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

export const CreativeStillFinishingRuntime = {
  async finish(task) {
    if (!task?.organization_id) throw new Error("organization_id required");
    if (!task?.creative_project_id) throw new Error("creative_project_id required");
    const tasks = await projectTasks(task);
    const sourceTask = generatedSourceTask(task, tasks);
    if (!sourceTask) throw new Error("CREATIVE_STILL_GENERATED_SOURCE_REQUIRED");
    const sourceUrl = stillOutputUrl(sourceTask.output);
    if (!sourceUrl) throw new Error("CREATIVE_STILL_SOURCE_URL_REQUIRED");
    const design = resolveStillDesign(task);
    const policy = task.input?.inspection_policy || task.metadata?.inspection_policy || {};
    const source = await materializeMedia({
      url: sourceUrl,
      file_name: sourceTask.title || null,
      organization_id: task.organization_id,
      policy,
    });
    const logos = await materializeLogoLayers(task, design, policy);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-still-"));
    const identity = crypto.createHash("sha256").update(JSON.stringify({
      project_id: task.creative_project_id,
      deliverable_id: task.metadata?.deliverable_id || null,
      source_task_id: sourceTask.id,
      source_url: sourceUrl,
      design,
    })).digest("hex");
    const outputs = [];
    try {
      for (const variant of design.variants) {
        const outputPath = path.join(directory, `${variant.id}.${variant.format}`);
        await renderVariant({ sourcePath: source.file_path, logos, design, variant, outputPath });
        outputs.push(await upload({ task, variant, outputPath, identity }));
      }
    } finally {
      await source.cleanup();
      await Promise.all(logos.map((item) => item.material.cleanup()));
      await fs.rm(directory, { recursive: true, force: true });
    }
    const primary = outputs[0];
    return {
      type: "IMAGE",
      name: task.title || primary.name,
      url: primary.url,
      file_url: primary.url,
      storage_path: primary.storage_path,
      mime_type: primary.mime_type,
      technical: {
        width: primary.width,
        height: primary.height,
        mime_type: primary.mime_type,
        checksum: primary.checksum,
        file_size_bytes: primary.file_size_bytes,
      },
      still_identity: identity,
      variants: outputs,
      exact_brand_assets_applied: design.logo_layers.length,
      text_layers_applied: design.text_layers.map((layer) => ({ id: layer.id, role: layer.role, text: layer.text })),
      source_task_id: sourceTask.id,
    };
  },

  async validate(task) {
    if (!task?.organization_id) throw new Error("organization_id required");
    const tasks = await projectTasks(task);
    const dependencies = dependencyTasks(task, tasks);
    const finished = dependencies.find((candidate) => list(unwrapStillOutput(candidate.output)?.variants).length) || null;
    const semantic = dependencies.find((candidate) => candidate !== finished && object(unwrapStillOutput(candidate.output))) || null;
    const output = object(unwrapStillOutput(finished?.output));
    const variants = list(output.variants);
    const design = resolveStillDesign(finished || task);
    const failures = [];
    if (!finished || finished.status !== "COMPLETED") failures.push("STILL_FINISH_TASK_NOT_COMPLETED");
    if (!output.url || !output.storage_path) failures.push("STILL_PRIMARY_ARTIFACT_REQUIRED");
    if (!variants.length) failures.push("STILL_VARIANT_MANIFEST_REQUIRED");
    for (const required of design.variants) {
      const variant = variants.find((candidate) => candidate.id === required.id);
      if (!variant) failures.push(`STILL_VARIANT_MISSING:${required.id}`);
      else {
        if (Number(variant.width) !== required.width || Number(variant.height) !== required.height) {
          failures.push(`STILL_DIMENSIONS_INVALID:${required.id}`);
        }
        if (!variant.url || !variant.storage_path) failures.push(`STILL_STORAGE_EVIDENCE_MISSING:${required.id}`);
        if (!text(variant.checksum)) failures.push(`STILL_CHECKSUM_MISSING:${required.id}`);
        if (Number(variant.file_size_bytes || 0) <= 0) failures.push(`STILL_FILE_EMPTY:${required.id}`);
      }
    }
    if (design.exact_brand_assets_required && Number(output.exact_brand_assets_applied || 0) < design.logo_layers.length) {
      failures.push("STILL_EXACT_BRAND_ASSETS_NOT_APPLIED");
    }
    const semanticEvidence = object(unwrapStillOutput(semantic?.output));
    if (semantic && !explicitStillQualityPass(semanticEvidence)) {
      failures.push(...stillQualityFailures(semanticEvidence));
      if (!stillQualityFailures(semanticEvidence).length) failures.push("STILL_SEMANTIC_QUALITY_REJECTED");
    }
    return {
      passed: failures.length === 0,
      verdict: failures.length === 0 ? "PASSED" : "FAILED",
      overall_score: failures.length === 0 ? 1 : 0,
      failed_checks: [...new Set(failures)],
      repair_instructions: [...new Set(failures)].map((failure) =>
        `Repair ${failure} and regenerate the finished still artifact.`,
      ),
      artifact: {
        url: output.url || null,
        storage_path: output.storage_path || null,
        variants,
      },
      checks: {
        real_file_evidence: Boolean(output.url && output.storage_path),
        variant_manifest_complete: design.variants.every((required) =>
          variants.some((candidate) => candidate.id === required.id),
        ),
        exact_brand_assets_applied: !design.exact_brand_assets_required ||
          Number(output.exact_brand_assets_applied || 0) >= design.logo_layers.length,
        semantic_quality_passed: !semantic || explicitStillQualityPass(semanticEvidence),
      },
    };
  },
};
