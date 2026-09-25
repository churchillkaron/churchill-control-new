import sharp from "sharp";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { measureImageStudioText } from "./CreativeImageStudioTypographyRuntime.js";
import { clipImageStudioCompositePlacement, imageStudioSourceCropGeometry, rotatedImageStudioPlacement } from "./CreativeImageStudioImageGeometryRuntime.js";
import { materializeImageStudioFont } from "./CreativeImageStudioFontRuntime.js";
import { normalizeImageStudioEffects } from "./CreativeImageStudioEffectsRuntime.js";
import { applyImageStudioPixelAdjustments, normalizeImageStudioAdjustments } from "./CreativeImageStudioAdjustmentRuntime.js";
import { applyImageStudioRetouchOperations } from "./CreativeImageStudioRetouchRuntime.js";
import { imageStudioMaskGeometry } from "./CreativeImageStudioReusableDesignRuntime.js";
import { adjustmentLayersForTarget, applyImageStudioAdjustmentLayers } from "./CreativeImageStudioAdjustmentLayerRuntime.js";

function esc(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;",
  })[char]);
}

function num(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

async function buildImageStudioMaskBuffer(geometry,width,height){
  const feather=Math.max(0,Number(geometry.feather||0));
  const opacity=Math.max(0,Math.min(1,Number(geometry.opacity??1)));
  let mask;
  if(geometry.invert){
    const x=Math.max(0,geometry.x),y=Math.max(0,geometry.y),w=Math.max(0,geometry.width),h=Math.max(0,geometry.height);
    const path=`M0 0H${width}V${height}H0Z M${x} ${y}H${x+w}V${y+h}H${x}Z`;
    mask=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><path d="${path}" fill="white" fill-rule="evenodd" opacity="${opacity}"/></svg>`);
  }else{
    mask=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="${geometry.x}" y="${geometry.y}" width="${geometry.width}" height="${geometry.height}" fill="white" fill-opacity="${opacity}"/></svg>`);
  }
  let bytes=await sharp(mask).png().toBuffer();
  if(feather>0) bytes=await sharp(bytes).blur(Math.max(.3,feather)).png().toBuffer();
  return bytes;
}

async function applyImageStudioEffects(input, style = {}) {
  const effects = normalizeImageStudioEffects(style);
  let pipeline = sharp(input).ensureAlpha();
  if (effects.brightness !== 1 || effects.saturation !== 1 || effects.hue !== 0) {
    pipeline = pipeline.modulate({ brightness: effects.brightness, saturation: effects.saturation, hue: effects.hue });
  }
  if (effects.contrast !== 1) {
    pipeline = pipeline.linear(effects.contrast, 128 * (1 - effects.contrast));
  }
  let rendered = await pipeline.png().toBuffer();
  if (effects.grayscale > 0) {
    const gray = await sharp(rendered).greyscale().png().toBuffer();
    if (effects.grayscale >= 0.999) rendered = gray;
    else {
      const meta = await sharp(rendered).metadata();
      const mask = Buffer.from(`<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white" fill-opacity="${effects.grayscale}"/></svg>`);
      const grayAlpha = await sharp(gray).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
      rendered = await sharp(rendered).composite([{ input: grayAlpha, blend: "over" }]).png().toBuffer();
    }
  }
  const adjustment = normalizeImageStudioAdjustments(style);
  const adjustmentActive = adjustment.exposure !== 0 || adjustment.temperature !== 0 || adjustment.tint !== 0 || adjustment.shadows !== 0 || adjustment.highlights !== 0 || adjustment.levels.black !== 0 || adjustment.levels.gamma !== 1 || adjustment.levels.white !== 255;
  if (adjustmentActive) {
    const rawResult = await sharp(rendered).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const adjusted = applyImageStudioPixelAdjustments(rawResult.data, rawResult.info.width, rawResult.info.height, rawResult.info.channels, style);
    rendered = await sharp(adjusted.bytes, { raw: { width: adjusted.width, height: adjusted.height, channels: adjusted.channels } }).png().toBuffer();
  }
  const retouchOperations = Array.isArray(style.retouch_operations) ? style.retouch_operations : [];
  if (retouchOperations.length) {
    const rawResult = await sharp(rendered).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const retouched = applyImageStudioRetouchOperations(rawResult.data, rawResult.info.width, rawResult.info.height, rawResult.info.channels, retouchOperations);
    rendered = await sharp(retouched.bytes, { raw: { width: retouched.width, height: retouched.height, channels: retouched.channels } }).png().toBuffer();
  }
  if (effects.blur > 0) rendered = await sharp(rendered).blur(Math.max(0.3, effects.blur)).png().toBuffer();
  if (effects.opacity < 1) {
    const meta = await sharp(rendered).metadata();
    const mask = Buffer.from(`<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white" fill-opacity="${effects.opacity}"/></svg>`);
    rendered = await sharp(rendered).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  }
  return { bytes: rendered, effects, adjustments: adjustment };
}

async function sourceAssets({ organization_id, creative_project_id, layers }) {
  const ids = [...new Set(layers.map((layer) => layer.source_asset_id).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin.from("creative_assets")
    .select("id,image_url,file_url,thumbnail_url,organization_id,creative_project_id")
    .eq("organization_id", organization_id).in("id", ids);
  if (error) throw error;
  return new Map((data || [])
    .filter((asset) => !asset.creative_project_id || asset.creative_project_id === creative_project_id)
    .map((asset) => [asset.id, asset]));
}

async function fetchImage(url) {
  if (!/^https?:\/\//i.test(String(url || ""))) {
    throw new Error("IMAGE_STUDIO_EXPORT_SOURCE_URL_UNSUPPORTED");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`IMAGE_STUDIO_EXPORT_SOURCE_FETCH_FAILED:${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function renderFontFaces(bindings) {
  if (!bindings?.size) return "";
  const rules = [...bindings.values()].map((binding) => `@font-face{font-family:'${String(binding.css_family).replaceAll("'", "\\'")}';src:url('${binding.data_url}') format('truetype');font-style:normal;font-weight:100 900;}`).join("\n");
  return `<defs><style><![CDATA[${rules}]]></style></defs>`;
}

async function exactFontBindings({ organization_id, creative_project_id, layers }) {
  const ids = [...new Set(layers.filter((layer) => layer.layer_type === "TEXT").map((layer) => String(layer.style?.font_asset_id || "").trim()).filter(Boolean))];
  const bindings = new Map();
  for (const font_asset_id of ids) {
    const font = await materializeImageStudioFont({ organization_id, creative_project_id, font_asset_id });
    bindings.set(font_asset_id, { ...font, data_url: `data:${font.mime_type || "font/ttf"};base64,${font.bytes.toString("base64")}` });
  }
  return bindings;
}

function textSvg(layer, fontBindings) {
  const b = layer.bounds || {}, s = layer.style || {}, c = layer.content || {};
  const rotation = num(layer.transform?.rotation);
  const x = num(b.x), y = num(b.y);
  const width = Math.max(1, num(b.width, 240)), height = Math.max(1, num(b.height, 100));
  const fontAssetId = String(s.font_asset_id || "").trim();
  if (!fontAssetId) throw new Error(`IMAGE_STUDIO_EXPORT_FONT_ASSET_REQUIRED:${layer.id}`);
  const fontBinding = fontBindings.get(fontAssetId);
  if (!fontBinding) throw new Error(`IMAGE_STUDIO_EXPORT_FONT_BINDING_MISSING:${fontAssetId}`);
  const measured = measureImageStudioText({ text: c.text || "Text", bounds: { width, height }, style: s });
  const color = esc(s.color || "#111111");
  const anchor = measured.align === "center" ? "middle" : measured.align === "right" ? "end" : "start";
  const tx = anchor === "middle" ? x + width / 2 : anchor === "end" ? x + width : x;
  const tspans = measured.visibleLines.map((line, index) =>
    `<tspan x="${tx}" dy="${index ? measured.lineHeightPx : 0}">${esc(line)}</tspan>`).join("");
  const baselineY = y + measured.offsetY + measured.fontSize;
  return `<g transform="rotate(${rotation} ${x + width / 2} ${y + height / 2})">` +
    `<text x="${tx}" y="${baselineY}" font-family="${esc(fontBinding.css_family)}" ` +
    `font-size="${measured.fontSize}" font-weight="${measured.weight}" fill="${color}" text-anchor="${anchor}" ` +
    `letter-spacing="${measured.letterSpacing}">${tspans}</text></g>`;
}

export async function renderImageStudioMaster({
  organization_id, creative_project_id, artboard, layers = [], format = "PNG",
}) {
  if (!organization_id || !creative_project_id || !artboard?.id) {
    throw new Error("IMAGE_STUDIO_EXPORT_SCOPE_REQUIRED");
  }
  const layerById = new Map(layers.map((layer) => [layer.id, layer]));
  const visible = layers.filter((layer) => layer.visible !== false && layer.metadata?.is_clip_mask !== true)
    .sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const assets = await sourceAssets({ organization_id, creative_project_id, layers: visible });
  const fontBindings = await exactFontBindings({ organization_id, creative_project_id, layers: visible });
  const composites = [];
  const text = [];
  for (const layer of visible) {
    if (layer.layer_type === "TEXT") {
      text.push(textSvg(layer, fontBindings));
      continue;
    }
    if (layer.layer_type === "ADJUSTMENT") continue;
    if (!layer.source_asset_id) continue;
    const asset = assets.get(layer.source_asset_id);
    if (!asset) throw new Error(`IMAGE_STUDIO_EXPORT_ASSET_SCOPE_FAILED:${layer.source_asset_id}`);
    const url = asset.image_url || asset.file_url || asset.thumbnail_url;
    const input = await fetchImage(url);
    const b = layer.bounds || {};
    const sourceMetadata = await sharp(input).metadata();
    const geometry = imageStudioSourceCropGeometry(layer, { width: sourceMetadata.width, height: sourceMetadata.height });
    const { width, height, zoom, scaledWidth, scaledHeight, extractLeft, extractTop, maskRadius, renderedWidth, renderedHeight, coverLeft, coverTop } = geometry;
    let prepared = await sharp(input)
      .resize(renderedWidth, renderedHeight, { fit: "fill" })
      .extract({ left: coverLeft, top: coverTop, width: scaledWidth, height: scaledHeight })
      .png().toBuffer();
    if (zoom > 1) prepared = await sharp(prepared).extract({ left: extractLeft, top: extractTop, width, height }).png().toBuffer();
    if (maskRadius > 0) {
      const mask = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${maskRadius}" ry="${maskRadius}" fill="white"/></svg>`);
      prepared = await sharp(prepared).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
    }
    const clipMaskId = layer.metadata?.clip_mask_layer_id;
    if (clipMaskId) {
      const clipMaskLayer = layerById.get(clipMaskId);
      if (!clipMaskLayer) throw new Error(`IMAGE_STUDIO_EXPORT_CLIP_MASK_MISSING:${clipMaskId}`);
      const maskGeometry = imageStudioMaskGeometry(layer, clipMaskLayer);
      if (!maskGeometry.visible && !maskGeometry.invert) {
        prepared = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
      } else {
        const maskBuffer = await buildImageStudioMaskBuffer(maskGeometry,width,height);
        prepared = await sharp(prepared).ensureAlpha().composite([{ input: maskBuffer, blend: "dest-in" }]).png().toBuffer();
      }
    }
    const effected = await applyImageStudioEffects(prepared, layer.style || {});
    prepared = effected.bytes;
    const adjustmentLayers = adjustmentLayersForTarget(visible, layer.id);
    if (adjustmentLayers.length) {
      const rawResult = await sharp(prepared).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const adjusted = applyImageStudioAdjustmentLayers(rawResult.data, rawResult.info.width, rawResult.info.height, rawResult.info.channels, adjustmentLayers);
      prepared = await sharp(adjusted.bytes, { raw: { width: adjusted.width, height: adjusted.height, channels: adjusted.channels } }).png().toBuffer();
    }
    const rotation = num(layer.transform?.rotation);
    if (rotation) prepared = await sharp(prepared).rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const metadata = await sharp(prepared).metadata();
    const placement = rotatedImageStudioPlacement(layer, { width: metadata.width, height: metadata.height });
    const clipped = clipImageStudioCompositePlacement(placement, artboard);
    if (!clipped.visible) continue;
    if (clipped.width !== placement.renderedWidth || clipped.height !== placement.renderedHeight) {
      prepared = await sharp(prepared).extract({ left: clipped.extractLeft, top: clipped.extractTop, width: clipped.width, height: clipped.height }).png().toBuffer();
    }
    composites.push({ input: prepared, left: clipped.left, top: clipped.top, blend: effected.effects.sharp_blend_mode });
  }
  const width = Math.round(num(artboard.width, 1080));
  const height = Math.round(num(artboard.height, 1350));
  const background = artboard.background?.color || "#ffffff";
  if (text.length) {
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${renderFontFaces(fontBindings)}${text.join("")}</svg>`;
    composites.push({ input: Buffer.from(svg), left: 0, top: 0 });
  }
  const base = sharp({ create: { width, height, channels: 4, background } }).composite(composites);
  let bytes;
  let mime;
  let extension;
  const target = String(format || "PNG").toUpperCase();
  if (target === "JPEG") {
    bytes = await base.jpeg({ quality: 95 }).toBuffer();
    mime = "image/jpeg";
    extension = "jpg";
  } else if (target === "PDF") {
    const png = await base.png({ compressionLevel: 9 }).toBuffer();
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([width, height]);
    const image = await pdf.embedPng(png);
    page.drawImage(image, { x: 0, y: 0, width, height });
    bytes = Buffer.from(await pdf.save());
    mime = "application/pdf";
    extension = "pdf";
  } else {
    bytes = await base.png({ compressionLevel: 9 }).toBuffer();
    mime = "image/png";
    extension = "png";
  }
  return { contract: "CREATIVE_IMAGE_STUDIO_DETERMINISTIC_EXPORT_V2", format: target, width, height, mime_type: mime, file_extension: extension, bytes, typography: { exact_font_asset_ids: [...fontBindings.keys()], embedded_exact_fonts: true }, effects: { contract: "CREATIVE_IMAGE_STUDIO_EFFECTS_V2", non_destructive: true }, adjustments: { contract: "CREATIVE_IMAGE_STUDIO_ADJUSTMENT_V1", non_destructive: true, deterministic_pixel_pipeline: true }, retouch: { contract: "CREATIVE_IMAGE_STUDIO_RETOUCH_V2", non_destructive: true, bounded_region_operations: true }, adjustment_layers: { contract: "CREATIVE_IMAGE_STUDIO_ADJUSTMENT_LAYER_V1", non_destructive: true, explicit_target_scope: true }, masks: { contract: "CREATIVE_IMAGE_STUDIO_REUSABLE_DESIGN_V2", non_destructive: true, feather_invert_opacity: true } };
}

export const CreativeImageStudioExportRuntime = Object.freeze({ contract: "CREATIVE_IMAGE_STUDIO_DETERMINISTIC_EXPORT_V2", render: renderImageStudioMaster });

export default CreativeImageStudioExportRuntime;
// Compatibility marker: CREATIVE_IMAGE_STUDIO_DETERMINISTIC_EXPORT_V1
