import fs from "node:fs";

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function requireText(value, needle, label) {
  if (!value.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}

const assetNode = source("lib/creative/assets/graph/documents/CreativeAssetNode.js");
const delivery = source("lib/creative/release/runtime/CreativeTemporalChannelDeliveryRuntime.js");
const releasePackage = source("lib/creative/release/runtime/CreativeReleasePackageRuntime.js");
const bootstrap = source("lib/creative/release/runtime/CreativeTemporalChannelDeliveryBootstrap.js");
const publishCommand = source("lib/creative/release/runtime/CreativePublishCommandRuntime.js");
const packageRoute = source("app/api/creative/release/package/route.js");

requireText(assetNode, 'RELEASE_PACKAGE: "RELEASE_PACKAGE"', "release package node type");

requireText(delivery, "CREATIVE_TEMPORAL_CHANNEL_DELIVERY_V2", "channel delivery v2");
requireText(delivery, "CreativeDeliveryMasterConformanceRuntime.analyze", "per-derivative conformance");
requireText(delivery, "CreativeDeliveryAudioQualityRuntime.analyze", "per-derivative delivery audio");
requireText(delivery, "conformance_report_id", "conformance evidence id");
requireText(delivery, "delivery_audio_report_id", "delivery audio evidence id");

requireText(releasePackage, "CREATIVE_RELEASE_PACKAGE_V1", "release package contract");
requireText(releasePackage, "release_package_identity", "immutable package identity");
requireText(releasePackage, "master_checksum", "master checksum binding");
requireText(releasePackage, "render_asset_node_id", "derivative asset binding");
requireText(releasePackage, "checksum: render.technical.checksum", "derivative checksum binding");
requireText(releasePackage, 'latestEvidence(nodes, render.id, "delivery_master_conformance")', "strict derivative evidence");
requireText(releasePackage, 'latestEvidence(nodes, render.id, "delivery_audio_qc")', "audio derivative evidence");
requireText(releasePackage, "publication_authorized: false", "package cannot authorize publication");
requireText(releasePackage, "human_reviewed: false", "machine certification separated from human approval");
requireText(releasePackage, "certified: true", "explicit certification state");
requireText(releasePackage, "immutable: true", "immutable package state");

requireText(bootstrap, "CreativeReleasePackageRuntime.certify", "automatic package certification");
requireText(bootstrap, "release_package_certified: true", "package certification result");

requireText(publishCommand, "CURRENT_CERTIFIED_RELEASE_PACKAGE_REQUIRED", "publish package gate");
requireText(publishCommand, "CERTIFIED_TARGET_DERIVATIVE_REQUIRED", "target derivative gate");
requireText(publishCommand, "certified_derivative_checksum", "publish checksum binding");
requireText(publishCommand, "release_package_identity", "publish package identity binding");
requireText(publishCommand, "final_render_asset_node_id: derivative.render_asset_node_id", "publish exact derivative routing");
requireText(publishCommand, 'scope: "PUBLISH_RELEASE"', "separate authenticated publish approval");

requireText(packageRoute, 'requiredPermission: "creative.quality.evaluate"', "governed package API permission");
requireText(packageRoute, "CreativeReleasePackageRuntime.certify", "package API certification");

console.log("AVANTIQO_VIDEO_RELEASE_PACKAGE_CONTRACT=PASS");
