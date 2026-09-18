import fs from "node:fs/promises";
import crypto from "node:crypto";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

export const AVANTIQO_ENVIRONMENT_ASSET_BINDING_CONTRACT =
  "AVANTIQO_ENVIRONMENT_ASSET_BINDING_V1";
const EXTENSIONS = new Set(["hdr", "exr", "tif", "tiff"]);

function text(value) { return String(value ?? "").trim(); }
function safe(value) {
  return text(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "environment";
}
function checksum(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function bindEnvironmentAsset({
  organization_id, creative_project_id, asset_node_id, sandbox,
  base_path = "/tmp/avantiqo-environments", policy = {},
} = {}) {
  if (!organization_id || !creative_project_id || !asset_node_id || !sandbox) {
    throw new Error("ENVIRONMENT_ASSET_BINDING_SCOPE_REQUIRED");
  }
  const node = await AssetGraphRepository.getById(asset_node_id);
  if (!node || text(node.organization_id) !== text(organization_id)) {
    throw new Error("ENVIRONMENT_ASSET_NOT_FOUND");
  }
  if (node.creative_project_id && text(node.creative_project_id) !== text(creative_project_id)) {
    throw new Error("ENVIRONMENT_ASSET_PROJECT_MISMATCH");
  }
  if (!node.url) throw new Error("ENVIRONMENT_ASSET_URL_REQUIRED");
  const media = await materializeMedia({
    organization_id,
    url: node.url,
    file_name: node.name || node.id + ".bin",
    mime_type: node.technical?.mime_type || null,
    policy,
  });
  try {
    const buffer = await fs.readFile(media.file_path);
    const sha = checksum(buffer);
    const extension = text(node.name || media.file_path).split(".").pop().toLowerCase();
    if (!EXTENSIONS.has(extension)) {
      throw new Error("ENVIRONMENT_ASSET_FORMAT_UNSUPPORTED:" + extension);
    }
    const directory = base_path + "/" + sha.slice(0, 2);
    const sandboxPath = directory + "/" + sha + "-" + safe(node.name || ("environment." + extension));
    await sandbox.runCommand({ cmd: "mkdir", args: ["-p", directory] });
    await sandbox.writeFiles([{ path: sandboxPath, content: buffer }]);
    return {
      contract: AVANTIQO_ENVIRONMENT_ASSET_BINDING_CONTRACT,
      asset_node_id: node.id, sandbox_path: sandboxPath,
      checksum: sha, extension,
      provider_calls_performed: false,
      cleanup: async () => media.cleanup?.(),
    };
  } catch (error) {
    await media.cleanup?.().catch?.(() => {});
    throw error;
  }
}
export const CreativeEnvironmentAssetBindingRuntime = Object.freeze({
  contract: AVANTIQO_ENVIRONMENT_ASSET_BINDING_CONTRACT,
  supported_formats: Object.freeze([...EXTENSIONS]),
  bind: bindEnvironmentAsset,
});
