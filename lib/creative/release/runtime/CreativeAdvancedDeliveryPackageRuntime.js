import crypto from "node:crypto";

export const AVANTIQO_ADVANCED_DELIVERY_PACKAGE_CONTRACT =
  "AVANTIQO_ADVANCED_DELIVERY_PACKAGE_V1";

const PROFILES = Object.freeze({
  HDR10_PQ: Object.freeze({
    package_kind: "MEZZANINE",
    color_target: "REC2020_PQ",
    minimum_bit_depth: 10,
    codec: "prores_ks",
    profile: "4444xq",
  }),
  HLG: Object.freeze({
    package_kind: "MEZZANINE",
    color_target: "REC2020_HLG",
    minimum_bit_depth: 10,
    codec: "prores_ks",
    profile: "4444xq",
  }),
  IMF_APP2E: Object.freeze({
    package_kind: "IMF",
    color_target: "REC2020_PQ",
    minimum_bit_depth: 10,
    specialist_packager_required: true,
    required_documents: ["ASSETMAP", "PKL", "CPL"],
  }),
  DCP_SMPTE: Object.freeze({
    package_kind: "DCP",
    color_target: "P3_D65",
    minimum_bit_depth: 12,
    specialist_packager_required: true,
    required_documents: ["ASSETMAP", "PKL", "CPL"],
  }),
});

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function planAdvancedDelivery({
  profile_id,
  master = {},
  color_authority = {},
  packager_evidence = null,
} = {}) {
  const profile = PROFILES[text(profile_id).toUpperCase()] || null;
  const blockers = [];
  if (!profile) blockers.push("ADVANCED_DELIVERY_PROFILE_UNSUPPORTED");
  if (!text(master.asset_node_id || master.id)) blockers.push("ADVANCED_DELIVERY_MASTER_REQUIRED");
  if (!text(master.checksum || master.technical?.checksum)) blockers.push("ADVANCED_DELIVERY_MASTER_CHECKSUM_REQUIRED");
  if (profile && color_authority.status !== "READY") blockers.push("ADVANCED_DELIVERY_COLOR_AUTHORITY_REQUIRED");
  if (profile && text(color_authority.output?.id) !== text(profile.color_target)) {
    blockers.push("ADVANCED_DELIVERY_COLOR_TARGET_MISMATCH");
  }
  if (profile?.specialist_packager_required) {
    if (packager_evidence?.passed !== true) blockers.push("ADVANCED_DELIVERY_SPECIALIST_PACKAGER_REQUIRED");
    const names = new Set(list(packager_evidence?.documents).map((item) => text(item.name || item)));
    for (const required of profile.required_documents || []) {
      if (!names.has(required)) blockers.push("ADVANCED_DELIVERY_DOCUMENT_REQUIRED:" + required);
    }
  }
  const body = {
    contract: AVANTIQO_ADVANCED_DELIVERY_PACKAGE_CONTRACT,
    profile_id: text(profile_id).toUpperCase(),
    profile,
    master_asset_node_id: text(master.asset_node_id || master.id) || null,
    master_checksum: text(master.checksum || master.technical?.checksum) || null,
    color_pipeline_hash: color_authority.color_pipeline_hash || null,
    packager_evidence: packager_evidence || null,
    policy: {
      imf_or_dcp_label_without_valid_package_forbidden: true,
      hdr_delivery_must_inherit_final_color_authority: true,
      source_precision_must_not_be_invented: true,
      package_documents_and_checksums_required: true,
    },
  };
  return {
    ...body,
    status: blockers.length ? "BLOCKED" : "READY",
    blockers,
    package_plan_hash: hash(body),
  };
}

export const CreativeAdvancedDeliveryPackageRuntime = Object.freeze({
  contract: AVANTIQO_ADVANCED_DELIVERY_PACKAGE_CONTRACT,
  profiles: PROFILES,
  plan: planAdvancedDelivery,
});
