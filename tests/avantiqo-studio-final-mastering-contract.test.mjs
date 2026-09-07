import assert from "node:assert/strict";
import fs from "node:fs";

const finalMastering = fs.readFileSync(
  "lib/creative/release/runtime/CreativeFinalMasteringRuntime.js",
  "utf8",
);
const channelDelivery = fs.readFileSync(
  "lib/creative/release/runtime/CreativeTemporalChannelDeliveryRuntime.js",
  "utf8",
);
const releasePackage = fs.readFileSync(
  "lib/creative/release/runtime/CreativeReleasePackageRuntime.js",
  "utf8",
);

assert.match(finalMastering, /AVANTIQO_FINAL_MASTERING_V1/);
assert.match(finalMastering, /AVANTIQO_FINAL_MASTERING_QC_V1/);
assert.match(finalMastering, /AVANTIQO_FINAL_MASTERING_SEAL_V1/);
assert.match(finalMastering, /actual_rendered_file_is_authority:\s*true/);
assert.match(finalMastering, /no_quality_inventing_transcode_allowed:\s*true/);
assert.match(finalMastering, /color_and_audio_seals_must_survive_final_mastering:\s*true/);
assert.match(finalMastering, /source_limitations/);
assert.match(finalMastering, /chroma_precision_limited/);
assert.match(finalMastering, /distribution_codec_source/);
assert.match(finalMastering, /publication_authorized:\s*false/);
assert.match(finalMastering, /provider_calls_executed:\s*0/);

assert.match(channelDelivery, /CreativeFinalMasteringRuntime\.certify/);
assert.match(channelDelivery, /FINAL_MASTERING_CERTIFICATION_REQUIRED/);
assert.match(channelDelivery, /release_derivative:\s*true/);
assert.match(channelDelivery, /source_final_master_checksum/);
assert.match(channelDelivery, /source_final_mastering_seal_hash/);
assert.match(channelDelivery, /derivatives_bound_to_exact_master_checksum:\s*true/);
assert.match(channelDelivery, /CREATIVE_TEMPORAL_CHANNEL_DELIVERY_V3/);

assert.match(releasePackage, /CREATIVE_RELEASE_PACKAGE_V3/);
assert.match(releasePackage, /CURRENT_MASTER_FINAL_MASTERING_SEAL_REQUIRED/);
assert.match(releasePackage, /DERIVATIVE_FINAL_MASTER_BINDING_INVALID/);
assert.match(releasePackage, /DERIVATIVE_PROVENANCE_REQUIRED/);
assert.match(releasePackage, /AVANTIQO_RELEASE_MANIFEST_V1/);
assert.match(releasePackage, /release_manifest_hash/);
assert.match(releasePackage, /publication_authorized:\s*false/);

console.log("AVANTIQO_STUDIO_FINAL_MASTERING_CONTRACT=PASS");
