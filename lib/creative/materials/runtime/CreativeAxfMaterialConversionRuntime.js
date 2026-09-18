import crypto from "node:crypto";

export const AVANTIQO_AXF_CONVERSION_AUTHORITY_CONTRACT =
  "AVANTIQO_AXF_CONVERSION_AUTHORITY_V1";

function text(value) { return String(value ?? "").trim(); }
function sha(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function validateAxfConversion({
  source_axf_checksum,
  converter_id,
  converter_version,
  conversion_manifest_id,
  conversion_manifest_checksum,
  target_materialx_checksum,
  actual_materialx_checksum,
  spectral_conversion_documented = false,
  appearance_validation_passed = false,
} = {}) {
  const blockers = [];
  const sourceChecksum = text(source_axf_checksum);
  const targetChecksum = text(target_materialx_checksum);
  const actualChecksum = text(actual_materialx_checksum);

  if (!/^[a-f0-9]{64}$/i.test(sourceChecksum)) blockers.push("AXF_SOURCE_CHECKSUM_REQUIRED");
  if (!text(converter_id)) blockers.push("AXF_CONVERTER_ID_REQUIRED");
  if (!text(converter_version)) blockers.push("AXF_CONVERTER_VERSION_REQUIRED");
  if (!text(conversion_manifest_id)) blockers.push("AXF_CONVERSION_MANIFEST_ID_REQUIRED");
  if (!/^[a-f0-9]{64}$/i.test(text(conversion_manifest_checksum))) {
    blockers.push("AXF_CONVERSION_MANIFEST_CHECKSUM_REQUIRED");
  }
  if (!/^[a-f0-9]{64}$/i.test(targetChecksum)) blockers.push("AXF_TARGET_MATERIALX_CHECKSUM_REQUIRED");
  if (targetChecksum && actualChecksum && targetChecksum !== actualChecksum) {
    blockers.push("AXF_MATERIALX_CHECKSUM_MISMATCH");
  }
  if (spectral_conversion_documented !== true) blockers.push("AXF_SPECTRAL_CONVERSION_DOCUMENTATION_REQUIRED");
  if (appearance_validation_passed !== true) blockers.push("AXF_APPEARANCE_VALIDATION_REQUIRED");
  const body = {
    contract: AVANTIQO_AXF_CONVERSION_AUTHORITY_CONTRACT,
    source_format: "AXF",
    target_format: "MATERIALX",
    source_axf_checksum: sourceChecksum || null,
    converter_id: text(converter_id) || null,
    converter_version: text(converter_version) || null,
    conversion_manifest_id: text(conversion_manifest_id) || null,
    conversion_manifest_checksum: text(conversion_manifest_checksum) || null,
    target_materialx_checksum: targetChecksum || null,
    spectral_conversion_documented: spectral_conversion_documented === true,
    appearance_validation_passed: appearance_validation_passed === true,
    native_axf_decode_performed: false,
    native_axf_decode_claimed: false,
    conversion_required: true,
  };
  return {
    ...body,
    status: blockers.length ? "BLOCKED" : "READY",
    blockers,
    conversion_authority_hash: sha(JSON.stringify(body)),
  };
}

export const CreativeAxfMaterialConversionRuntime = Object.freeze({
  contract: AVANTIQO_AXF_CONVERSION_AUTHORITY_CONTRACT,
  validate: validateAxfConversion,
});
