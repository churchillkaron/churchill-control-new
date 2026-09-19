import fs from "node:fs/promises";
import crypto from "node:crypto";
import * as AssetGraphRepository from "../../assets/graph/repositories/CreativeAssetGraphRepository.js";
import { materializeMedia } from "../../media/runtime/CreativeMediaInspectionRuntime.js";

export const AVANTIQO_OPENVDB_USD_VOLUME_CONTRACT =
  "AVANTIQO_OPENVDB_USD_VOLUME_WORKFLOW_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function safe(value, fallback = "Volume") {
  return text(value).replace(/[^A-Za-z0-9_]+/g, "_").replace(/^[^A-Za-z_]+/, "") || fallback;
}
function sha(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function vec(value, fallback = [0,0,0]) {
  return Array.isArray(value) && value.length >= 3 ? value.slice(0,3).map(Number) : fallback;
}
export function authorOpenVdbUsdVolume(volume) {
  const prim = safe(volume.name, "Volume");
  const fields = list(volume.fields).length ? list(volume.fields) : ["density"];
  const lines = [
    "#usda 1.0",
    "(",
    "    metersPerUnit = 1",
    "    upAxis = \"Z\"",
    ")",
    "",
    'def Xform "World" {',
    '  def Volume "' + prim + '" {',
  ];
  for (const field of fields) {
    const fieldPrim = safe(field, "density");
    lines.push('    rel field:' + fieldPrim + ' = </World/' + prim + '/' + fieldPrim + '>');
  }
  lines.push("  }");
  for (const field of fields) {
    const fieldPrim = safe(field, "density");
    lines.push('  def OpenVDBAsset "' + fieldPrim + '" {');
    lines.push('    asset filePath = @' + volume.sandbox_path + '@');
    lines.push('    token fieldName = "' + text(field) + '"');
    lines.push("  }");
  }
  lines.push("}", "");
  return lines.join("\n");
}
export async function bindOpenVdbVolumes({
  organization_id, creative_project_id, volumes = [], sandbox,
  base_path = "/tmp/avantiqo-openvdb", policy = {},
} = {}) {
  if (!organization_id || !creative_project_id || !sandbox) {
    throw new Error("OPENVDB_VOLUME_SCOPE_REQUIRED");
  }
  const cleanups = []; const bound = [];
  try {
    for (let index = 0; index < list(volumes).length; index += 1) {
      const spec = volumes[index] || {};
      const assetId = text(spec.asset_node_id);
      if (!assetId) throw new Error("OPENVDB_ASSET_NODE_REQUIRED");
      const node = await AssetGraphRepository.getById(assetId);
      if (!node || text(node.organization_id) !== text(organization_id)) {
        throw new Error("OPENVDB_ASSET_NOT_FOUND:" + assetId);
      }
      if (node.creative_project_id && text(node.creative_project_id) !== text(creative_project_id)) {
        throw new Error("OPENVDB_PROJECT_MISMATCH:" + assetId);
      }
      if (!node.url) throw new Error("OPENVDB_ASSET_URL_REQUIRED:" + assetId);
      const extension = text(node.name).split(".").pop().toLowerCase();
      if (extension !== "vdb") throw new Error("OPENVDB_FILE_EXTENSION_REQUIRED:" + assetId);
      const media = await materializeMedia({
        organization_id, url: node.url, file_name: node.name || (assetId + ".vdb"),
        mime_type: node.technical?.mime_type || "application/octet-stream", policy,
      });
      cleanups.push(media);
      const buffer = await fs.readFile(media.file_path);
      const checksum = sha(buffer);
      const sandboxPath = base_path + "/" + safe(spec.name || node.name, "volume") + "-" + checksum.slice(0,16) + ".vdb";
      await sandbox.runCommand({ cmd: "mkdir", args: ["-p", base_path] });
      await sandbox.writeFiles([{ path: sandboxPath, content: buffer }]);
      const volume = {
        id: text(spec.id) || "volume-" + (index + 1),
        name: text(spec.name) || node.name || "Volume " + (index + 1),
        asset_node_id: node.id,
        sandbox_path: sandboxPath,
        checksum,
        fields: list(spec.fields).map(text).filter(Boolean),
        location: vec(spec.location),
        rotation: vec(spec.rotation),
        scale: vec(spec.scale, [1,1,1]),
        density_scale: Number.isFinite(Number(spec.density_scale)) ? Number(spec.density_scale) : 1,
        temperature_scale: Number.isFinite(Number(spec.temperature_scale)) ? Number(spec.temperature_scale) : 1,
        blackbody_intensity: Number.isFinite(Number(spec.blackbody_intensity)) ? Number(spec.blackbody_intensity) : 0,
      };
      volume.usda = authorOpenVdbUsdVolume(volume);
      volume.usda_checksum = sha(Buffer.from(volume.usda));
      bound.push(volume);
    }
    return {
      contract: AVANTIQO_OPENVDB_USD_VOLUME_CONTRACT,
      status: "READY",
      volumes: bound,
      volume_count: bound.length,
      openvdb_native_assets: true,
      usd_volume_schema_authored: true,
      provider_calls_performed: false,
      cleanup: async () => { for (const media of cleanups) await media.cleanup?.().catch?.(() => {}); },
    };
  } catch (error) {
    for (const media of cleanups) await media.cleanup?.().catch?.(() => {});
    throw error;
  }
}

export const CreativeOpenVdbUsdVolumeRuntime = Object.freeze({
  contract: AVANTIQO_OPENVDB_USD_VOLUME_CONTRACT,
  bind: bindOpenVdbVolumes,
});
