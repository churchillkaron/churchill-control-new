import crypto from "node:crypto";

export const AVANTIQO_NATIVE_AXF_SDK_CONTRACT =
  "AVANTIQO_NATIVE_AXF_SDK_INGEST_V1";

const REPRESENTATIONS = new Set(["SVBRDF", "CARPAINT", "BTF", "BSSRDF", "TRANSMISSIVE"]);

function text(value) { return String(value ?? "").trim(); }
function sha(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export function authorizeNativeAxfSdk({
  sdk_vendor = "X-RITE",
  sdk_version,
  platform,
  license_fingerprint,
  bridge_id,
  bridge_checksum,
} = {}) {
  const blockers = [];
  if (text(sdk_vendor).toUpperCase() !== "X-RITE") blockers.push("AXF_NATIVE_XRITE_SDK_REQUIRED");
  if (!text(sdk_version)) blockers.push("AXF_NATIVE_SDK_VERSION_REQUIRED");
  if (!["LINUX", "WINDOWS"].includes(text(platform).toUpperCase())) blockers.push("AXF_NATIVE_SUPPORTED_PLATFORM_REQUIRED");
  if (!/^[a-f0-9]{32,128}$/i.test(text(license_fingerprint))) blockers.push("AXF_NATIVE_LICENSE_FINGERPRINT_REQUIRED");
  if (!text(bridge_id)) blockers.push("AXF_NATIVE_BRIDGE_ID_REQUIRED");
  if (!/^[a-f0-9]{64}$/i.test(text(bridge_checksum))) blockers.push("AXF_NATIVE_BRIDGE_CHECKSUM_REQUIRED");
  const body = {
    contract: AVANTIQO_NATIVE_AXF_SDK_CONTRACT,
    sdk_vendor: text(sdk_vendor).toUpperCase(),
    sdk_version: text(sdk_version) || null,
    platform: text(platform).toUpperCase() || null,
    license_fingerprint: text(license_fingerprint) || null,
    bridge_id: text(bridge_id) || null,
    bridge_checksum: text(bridge_checksum) || null,
    licensed_sdk_required: true,
    native_decode_claim_allowed: blockers.length === 0,
  };
  return { ...body, status: blockers.length ? "BLOCKED" : "READY", blockers, sdk_authority_hash: hash(body) };
}

export async function decodeNativeAxf({
  source_buffer,
  sdk_authority,
  execute_sdk,
} = {}) {
  if (!Buffer.isBuffer(source_buffer) || !source_buffer.length) throw new Error("AXF_NATIVE_SOURCE_BUFFER_REQUIRED");
  if (sdk_authority?.status !== "READY" || sdk_authority?.contract !== AVANTIQO_NATIVE_AXF_SDK_CONTRACT) {
    throw new Error("AXF_NATIVE_SDK_AUTHORITY_REQUIRED");
  }
  if (typeof execute_sdk !== "function") throw new Error("AXF_NATIVE_LICENSED_SDK_EXECUTOR_REQUIRED");
  const sourceChecksum = sha(source_buffer);
  const result = await execute_sdk({
    contract: AVANTIQO_NATIVE_AXF_SDK_CONTRACT,
    source_buffer,
    source_checksum: sourceChecksum,
    sdk_authority,
  });
  if (result?.native_decode_performed !== true) throw new Error("AXF_NATIVE_DECODE_PROOF_REQUIRED");
  if (text(result.source_checksum) !== sourceChecksum) throw new Error("AXF_NATIVE_SOURCE_CHECKSUM_MISMATCH");
  const representation = text(result.representation).toUpperCase();
  if (!REPRESENTATIONS.has(representation)) throw new Error("AXF_NATIVE_REPRESENTATION_UNSUPPORTED:" + representation);
  if (!Array.isArray(result.materials) || !result.materials.length) throw new Error("AXF_NATIVE_MATERIAL_OUTPUT_REQUIRED");
  const evidence = {
    source_checksum: sourceChecksum,
    representation,
    sdk_version: sdk_authority.sdk_version,
    bridge_checksum: sdk_authority.bridge_checksum,
    material_count: result.materials.length,
    native_decode_performed: true,
    spectral_data_preserved: result.spectral_data_preserved === true,
    appearance_metadata_preserved: result.appearance_metadata_preserved === true,
  };
  if (!evidence.appearance_metadata_preserved) throw new Error("AXF_NATIVE_APPEARANCE_METADATA_REQUIRED");
  return {
    contract: AVANTIQO_NATIVE_AXF_SDK_CONTRACT,
    status: "READY",
    ...result,
    ...evidence,
    native_axf_decode_claimed: true,
    decode_evidence_hash: hash(evidence),
  };
}

export const CreativeNativeAxfSdkRuntime = Object.freeze({
  contract: AVANTIQO_NATIVE_AXF_SDK_CONTRACT,
  authorize: authorizeNativeAxfSdk,
  decode: decodeNativeAxf,
});
