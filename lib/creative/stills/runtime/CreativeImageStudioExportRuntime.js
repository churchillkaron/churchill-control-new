import sharp from "sharp";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function esc(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;",
  })[char]);
}

function num(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
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

function textSvg(layer) {
  const b = layer.bounds || {}, s = layer.style || {}, c = layer.content || {};
  const rotation = num(layer.transform?.rotation);
  const x = num(b.x), y = num(b.y);
  const width = Math.max(1, num(b.width, 240)), height = Math.max(1, num(b.height, 100));
  const size = Math.max(6, num(s.font_size, 36));
  const weight = num(s.font_weight, 500);
  const color = esc(s.color || "#111111");
  const anchor = s.text_align === "center" ? "middle" : s.text_align === "right" ? "end" : "start";
  const tx = anchor === "middle" ? x + width / 2 : anchor === "end" ? x + width : x;
  const lines = String(c.text || "Text").split(/\n/);
  const lineHeight = size * num(s.line_height, 1.05);
  const tspans = lines.map((line, index) =>
    `<tspan x="${tx}" dy="${index ? lineHeight : 0}">${esc(line)}</tspan>`).join("");
  return `<g transform="rotate(${rotation} ${x + width / 2} ${y + height / 2})">` +
    `<text x="${tx}" y="${y + size}" font-family="Arial,Helvetica,sans-serif" ` +
    `font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${tspans}</text></g>`;
}

export async function renderImageStudioMaster({
  organization_id, creative_project_id, artboard, layers = [], format = "PNG",
}) {
  if (!organization_id || !creative_project_id || !artboard?.id) {
    throw new Error("IMAGE_STUDIO_EXPORT_SCOPE_REQUIRED");
  }
  const visible = layers.filter((layer) => layer.visible !== false)
    .sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const assets = await sourceAssets({ organization_id, creative_project_id, layers: visible });
  const composites = [];
  const text = [];
  for (const layer of visible) {
    if (layer.layer_type === "TEXT") {
      text.push(textSvg(layer));
      continue;
    }
    if (!layer.source_asset_id) continue;
    const asset = assets.get(layer.source_asset_id);
    if (!asset) throw new Error(`IMAGE_STUDIO_EXPORT_ASSET_SCOPE_FAILED:${layer.source_asset_id}`);
    const url = asset.image_url || asset.file_url || asset.thumbnail_url;
    const input = await fetchImage(url);
    const b = layer.bounds || {};
    const width = Math.max(1, Math.round(num(b.width, 240)));
    const height = Math.max(1, Math.round(num(b.height, 180)));
    let prepared = await sharp(input).resize(width, height, { fit: "cover", position: "centre" }).png().toBuffer();
    const rotation = num(layer.transform?.rotation);
    if (rotation) {
      prepared = await sharp(prepared).rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    }
    composites.push({ input: prepared, left: Math.round(num(b.x)), top: Math.round(num(b.y)) });
  }
  const width = Math.round(num(artboard.width, 1080));
  const height = Math.round(num(artboard.height, 1350));
  const background = artboard.background?.color || "#ffffff";
  if (text.length) {
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${text.join("")}</svg>`;
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
  return { contract: "CREATIVE_IMAGE_STUDIO_DETERMINISTIC_EXPORT_V1", format: target, width, height, mime_type: mime, file_extension: extension, bytes };
}

export const CreativeImageStudioExportRuntime = Object.freeze({ contract: "CREATIVE_IMAGE_STUDIO_DETERMINISTIC_EXPORT_V1", render: renderImageStudioMaster });

export default CreativeImageStudioExportRuntime;
