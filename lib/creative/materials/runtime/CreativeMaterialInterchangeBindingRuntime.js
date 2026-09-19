import fs from "node:fs/promises";

import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import { CreativeMaterialXInterchangeRuntime } from "./CreativeMaterialXInterchangeRuntime.js";
import { CreativeNativeAxfSdkRuntime } from "./CreativeNativeAxfSdkRuntime.js";

export const AVANTIQO_MATERIAL_INTERCHANGE_BINDING_CONTRACT =
  "AVANTIQO_MATERIAL_INTERCHANGE_BINDING_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

export async function resolveMaterialInterchangeAssets({
  organization_id,
  creative_project_id,
  materials = [],
  policy = {},
} = {}) {
  if (!organization_id || !creative_project_id) {
    throw new Error("MATERIAL_INTERCHANGE_SCOPE_REQUIRED");
  }
  const resolved = [];
  const cleanups = [];
  try {
    for (const raw of list(materials)) {
      const source = object(raw);
      const axfAssetId = text(source.axf_asset_node_id);
      if (axfAssetId) {
        const axfNode = await AssetGraphRepository.getById(axfAssetId);
        if (!axfNode || text(axfNode.organization_id) !== text(organization_id)) {
          throw new Error("AXF_ASSET_NOT_FOUND:" + axfAssetId);
        }
        if (axfNode.creative_project_id && text(axfNode.creative_project_id) !== text(creative_project_id)) {
          throw new Error("AXF_ASSET_PROJECT_MISMATCH:" + axfAssetId);
        }
        if (!axfNode.url) throw new Error("AXF_ASSET_URL_REQUIRED:" + axfAssetId);
        const axfMedia = await materializeMedia({
          organization_id,
          url: axfNode.url,
          file_name: axfNode.name || (axfNode.id + ".axf"),
          mime_type: axfNode.technical?.mime_type || "application/octet-stream",
          policy,
        });
        cleanups.push(axfMedia);
        const axfBuffer = await fs.readFile(axfMedia.file_path);
        const decoded = await CreativeNativeAxfSdkRuntime.decode({
          source_buffer: axfBuffer,
          sdk_authority: policy.native_axf_sdk_authority,
          execute_sdk: policy.native_axf_sdk_executor,
        });
        const decodedMaterial = object(decoded.materials[0]);
        resolved.push({
          ...decodedMaterial,
          ...source,
          material_id: source.material_id || decodedMaterial.material_id || decodedMaterial.id || axfNode.id,
          name: source.name || decodedMaterial.name || axfNode.name || "Native AxF Material",
          material_interchange: {
            contract: CreativeNativeAxfSdkRuntime.contract,
            source_format: "AXF",
            source_asset_node_id: axfNode.id,
            source_checksum: decoded.source_checksum,
            representation: decoded.representation,
            sdk_version: decoded.sdk_version,
            native_axf_decode_performed: true,
            native_axf_decode_claimed: true,
            decode_evidence_hash: decoded.decode_evidence_hash,
          },
        });
        continue;
      }
      const assetId = text(source.materialx_asset_node_id);
      if (!assetId) {
        resolved.push(source);
        continue;
      }

      const node = await AssetGraphRepository.getById(assetId);
      if (!node || text(node.organization_id) !== text(organization_id)) {
        throw new Error("MATERIALX_ASSET_NOT_FOUND:" + assetId);
      }
      if (node.creative_project_id && text(node.creative_project_id) !== text(creative_project_id)) {
        throw new Error("MATERIALX_ASSET_PROJECT_MISMATCH:" + assetId);
      }
      if (!node.url) throw new Error("MATERIALX_ASSET_URL_REQUIRED:" + assetId);

      const extension = text(node.name).split(".").pop().toLowerCase();
      if (extension !== "mtlx") throw new Error("MATERIALX_ASSET_EXTENSION_REQUIRED:" + assetId);
      const media = await materializeMedia({
        organization_id,
        url: node.url,
        file_name: node.name || (node.id + ".mtlx"),
        mime_type: node.technical?.mime_type || "application/xml",
        policy,
      });
      cleanups.push(media);
      const xml = await fs.readFile(media.file_path, "utf8");
      const imported = CreativeMaterialXInterchangeRuntime.importStandardSurface({
        xml,
        material_id: source.material_id || source.id || null,
        material_class: source.material_class || source.class || "CUSTOM_PBR",
        continuity_key: source.continuity_key || null,
        source_asset_node_id: node.id,
        axf_conversion: source.axf_conversion || node.metadata?.axf_conversion || null,
        resource_bindings:
          object(source.materialx_resource_bindings || node.metadata?.materialx_resource_bindings),
      });
      resolved.push({
        ...imported.material,
        ...source,
        material_id: imported.material.material_id,
        name: source.name || imported.material.name,
        material_class: source.material_class || source.class || imported.material.material_class,
        continuity_key: source.continuity_key || imported.material.continuity_key,
        pbr: {
          ...imported.material.pbr,
          ...object(source.pbr),
        },
        material_interchange: imported.material.material_interchange,
        materialx_asset_node_id: node.id,
      });
    }

    return {
      contract: AVANTIQO_MATERIAL_INTERCHANGE_BINDING_CONTRACT,
      materials: resolved,
      material_count: resolved.length,
      materialx_count: resolved.filter((item) => item.material_interchange?.source_format === "MATERIALX").length,
      provider_calls_performed: false,
    };
  } finally {
    for (const media of cleanups) await media.cleanup?.().catch?.(() => {});
  }
}

export const CreativeMaterialInterchangeBindingRuntime = Object.freeze({
  contract: AVANTIQO_MATERIAL_INTERCHANGE_BINDING_CONTRACT,
  resolve: resolveMaterialInterchangeAssets,
});
