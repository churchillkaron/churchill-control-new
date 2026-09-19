import test from "node:test";
import assert from "node:assert/strict";
import { buildMusicProfessionalProductionManifest, nextMusicProfessionalProductionAction } from "../lib/creative/music/runtime/CreativeMusicProfessionalProductionRuntime.js";

test("explicit non-instrumental intent requires professional vocal production even with compose_music capability", () => {
  const plan = { selected_capabilities: [{ id: "compose_music" }], objective: "Professional release acceptance" };
  const manifest = buildMusicProfessionalProductionManifest({ plan, input: { instrumental: false }, evidence: { source_generated: true, stems_ready: true } });
  assert.equal(manifest.vocals_required, true);
  assert.equal(manifest.stages.find((stage) => stage.id === "VOCAL_PRODUCTION")?.required, true);
  const next = nextMusicProfessionalProductionAction({ plan, input: { instrumental: false }, evidence: { source_generated: true, stems_ready: true } });
  assert.equal(next.stage_id, "VOCAL_PRODUCTION");
});

test("explicit instrumental intent still skips professional vocal production", () => {
  const plan = { selected_capabilities: [{ id: "create_song" }], objective: "song with lyrics" };
  const manifest = buildMusicProfessionalProductionManifest({ plan, input: { instrumental: true }, evidence: { source_generated: true, stems_ready: true } });
  assert.equal(manifest.vocals_required, false);
  assert.equal(manifest.stages.find((stage) => stage.id === "VOCAL_PRODUCTION")?.required, false);
});
