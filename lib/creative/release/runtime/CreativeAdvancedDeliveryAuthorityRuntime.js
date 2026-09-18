import crypto from "node:crypto";

export const AVANTIQO_ADVANCED_DELIVERY_AUTHORITY_CONTRACT =
  "AVANTIQO_ADVANCED_DELIVERY_AUTHORITY_V1";

const TARGETS = Object.freeze({
  HDR10_MEZZANINE: Object.freeze({
    color_target: "REC2020_PQ", internal: true, package: false,
    required_video_codec: ["prores_ks", "hevc"], minimum_bit_depth: 10,
  }),
  HLG_MEZZANINE: Object.freeze({
    color_target: "REC2020_HLG", internal: true, package: false,
    required_video_codec: ["prores_ks", "hevc"], minimum_bit_depth: 10,
  }),
  IMF_APP2E: Object.freeze({
    color_target: "REC2020_PQ", internal: false, package: true, packager: "IMF",
  }),
  DCP_SMPTE: Object.freeze({
    color_target: "P3_DCI_XYZ", internal: false, package: true, packager: "DCP",
  }),
});

function text(value) { return String(value ?? "").trim(); }
function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function authorizeAdvancedDelivery({
  target,
  final_mastering_seal = null,
  color_authority = null,
  package_evidence = null,
  technical = {},
} = {}) {
  const id = text(target).toUpperCase();
  const spec = TARGETS[id] || null;
  const blockers = [];
  if (!spec) blockers.push("ADVANCED_DELIVERY_TARGET_UNSUPPORTED:" + id);
  if (!final_mastering_seal?.seal_hash) blockers.push("ADVANCED_DELIVERY_FINAL_MASTER_SEAL_REQUIRED");
  if (spec && id !== "DCP_SMPTE") {
    if (color_authority?.status !== "READY" ||
        text(color_authority?.output?.id) !== text(spec.color_target)) {
      blockers.push("ADVANCED_DELIVERY_COLOR_AUTHORITY_MISMATCH:" + id);
    }
  }
  if (id === "DCP_SMPTE") {
    if (text(technical.color_space).toUpperCase() !== "XYZ" &&
        text(technical.color_space).toUpperCase() !== "P3_DCI_XYZ") {
      blockers.push("DCP_XYZ_MASTER_REQUIRED");
    }
    if (Number(technical.frame_rate) !== 24 && Number(technical.frame_rate) !== 48) {
      blockers.push("DCP_FRAME_RATE_24_OR_48_REQUIRED");
    }
  }
  if (spec?.package) {
    const evidence = package_evidence || {};
    if (text(evidence.packager).toUpperCase() !== spec.packager) {
      blockers.push("ADVANCED_DELIVERY_SPECIALIST_PACKAGER_REQUIRED:" + spec.packager);
    }
    if (!/^[a-f0-9]{64}$/i.test(text(evidence.package_checksum))) {
      blockers.push("ADVANCED_DELIVERY_PACKAGE_CHECKSUM_REQUIRED");
    }
    if (evidence.validation_passed !== true) {
      blockers.push("ADVANCED_DELIVERY_PACKAGE_VALIDATION_REQUIRED");
    }
  }
  const body = {
    contract: AVANTIQO_ADVANCED_DELIVERY_AUTHORITY_CONTRACT,
    target: id,
    specification: spec,
    final_mastering_seal_hash: final_mastering_seal?.seal_hash || null,
    color_pipeline_hash: color_authority?.color_pipeline_hash || null,
    package_evidence: package_evidence || null,
    technical,
    policy: {
      imf_and_dcp_must_not_be_fake_file_extensions: true,
      specialist_packager_output_must_be_validated: true,
      hdr_delivery_requires_final_color_authority: true,
      final_master_checksum_and_seal_must_survive_packaging: true,
    },
  };
  return {
    ...body,
    status: blockers.length ? "BLOCKED" : "READY",
    blockers,
    delivery_authority_hash: hash(body),
  };
}

export const CreativeAdvancedDeliveryAuthorityRuntime = Object.freeze({
  contract: AVANTIQO_ADVANCED_DELIVERY_AUTHORITY_CONTRACT,
  targets: TARGETS,
  authorize: authorizeAdvancedDelivery,
});
