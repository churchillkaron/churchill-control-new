import test from "node:test";
import assert from "node:assert/strict";
import { classifyStillStudioHandoff } from "../lib/creative/image/runtime/CreativeStillStudioHandoffRuntime.js";

test("generated still may enter Image Studio before it is motion approved", () => {
  const result = classifyStillStudioHandoff({ asset:{ id:"a1", status:"DRAFT", url:"https://example.com/a.png", metadata:{} }, requested_destination:"IMAGE_STUDIO" });
  assert.equal(result.allowed, true);
  assert.equal(result.destinations.image_studio.ready, true);
  assert.equal(result.destinations.video_studio.ready, false);
});

test("Video Studio handoff fails closed until approved still evidence is sealed", () => {
  const result = classifyStillStudioHandoff({ asset:{ id:"a1", status:"DRAFT", url:"https://example.com/a.png", metadata:{} }, requested_destination:"VIDEO_STUDIO" });
  assert.equal(result.allowed, false);
  assert.ok(result.failures.includes("VIDEO_SOURCE_APPROVAL_REQUIRED"));
  assert.ok(result.failures.includes("VIDEO_SOURCE_EXPLICIT_APPROVAL_REQUIRED"));
});

test("approved still can hand to Video Studio without giving Video ownership of source master", () => {
  const result = classifyStillStudioHandoff({ asset:{ id:"a1", status:"APPROVED", url:"https://example.com/a.png", revision:4, metadata:{ image_asset_perceptual_qc_sealed:true, approved_for_video_source:true, release_approved:true, image_asset_pack_qc_seal_hash:"qc" } }, requested_destination:"VIDEO_STUDIO" });
  assert.equal(result.allowed, true);
  assert.equal(result.destinations.video_studio.ready, true);
  assert.equal(result.ownership.video_may_mutate_still_master, false);
  assert.equal(result.ownership.source_repair_owner, "IMAGE_STUDIO");
  assert.equal(result.lineage.source_version, 4);
  assert.ok(result.lineage_digest);
});

test("Image Studio exposes deliberate same-project handoff to Video Studio", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync("components/creative/specialist/ImageStudioWorkspace.jsx", "utf8");
  assert.match(source, /Studio handoff/);
  assert.match(source, /source_asset_id=/);
  assert.match(source, /source_lineage=/);
  assert.match(source, /Video Studio never overwrites the still master/);
});
