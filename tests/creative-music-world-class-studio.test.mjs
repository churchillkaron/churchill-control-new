import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWorldClassMusicStudioPlan,
  listWorldClassMusicCapabilities,
  listWorldClassMusicWorkers,
} from "../lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js";

test("world-class Music Studio exposes broad capability and worker coverage", () => {
  const capabilities = listWorldClassMusicCapabilities();
  const workers = listWorldClassMusicWorkers();
  assert.ok(capabilities.length >= 25);
  assert.ok(workers.length >= 20);
  for (const id of ["compose_music", "backing_track", "stem_separation", "remove_vocals", "melody", "sfx", "mix", "master"]) {
    assert.ok(capabilities.some((item) => item.id === id), id);
  }
  for (const id of ["music_director", "composer", "vocal_producer", "mix_engineer", "mastering_engineer", "listening_panel", "business_partner"]) {
    assert.ok(workers.some((item) => item.id === id), id);
  }
});

test("backing-track request selects the separation and finishing team", () => {
  const plan = buildWorldClassMusicStudioPlan({ objective: "Take this song, remove the vocals, change the key and make a professional backing track" });
  assert.equal(plan.contract, "AVANTIQO_WORLD_CLASS_MUSIC_STUDIO_V1");
  assert.ok(plan.selected_capabilities.some((item) => item.id === "backing_track"));
  assert.ok(plan.workers.some((item) => item.id === "stem_specialist"));
  assert.ok(plan.workers.some((item) => item.id === "mix_engineer"));
  assert.ok(plan.workers.some((item) => item.id === "mastering_engineer"));
  assert.equal(plan.governance.preserve_original_sources, true);
});

test("song request builds a concept-to-release production graph", () => {
  const plan = buildWorldClassMusicStudioPlan({ objective: "Create a song with vocals, a strong melody and live-feeling drums" });
  assert.ok(plan.selected_capabilities.some((item) => item.id === "create_song"));
  assert.ok(plan.selected_capabilities.some((item) => item.id === "melody"));
  assert.ok(plan.selected_capabilities.some((item) => item.id === "drums_groove"));
  assert.equal(plan.phases[0].phase, "BRIEF");
  assert.equal(plan.phases.at(-1).phase, "DELIVERY_RELEASE");
  assert.ok(plan.phases.some((item) => item.phase === "DAILIES_LISTENING" && item.gate));
  assert.ok(plan.phases.some((item) => item.phase === "QUALITY_TRIBUNAL" && item.gate));
});

test("Business Partner catalog registration exposes Music planning and execution", async () => {
  const fs = await import("node:fs/promises");
  const runtimeSource = await fs.readFile(new URL("../lib/creative/runtime/CreativeRuntime.js", import.meta.url), "utf8");
  assert.match(runtimeSource, /planWorldClassProduction/);
  assert.match(runtimeSource, /executeWorldClassProduction/);

  const executionSource = await fs.readFile(new URL("../lib/creative/music/capabilities/executeWorldClassMusicStudio.js", import.meta.url), "utf8");
  assert.match(executionSource, /operatorEnabled:\s*true/);
  assert.match(executionSource, /operatorMode:\s*"write"/);
  assert.match(executionSource, /operatorRequiresConfirmation:\s*true/);
});


test("Business Partner attachment reflex binds one audio source to Music Studio", async () => {
  const { hasPreparedAttachmentReflexCandidate, resolvePreparedAttachmentReflex } = await import("../lib/operator/runtime/OperatorPreparedAttachmentReflex.js");
  const attachments = [{ id:"a1", name:"song.wav", mime_type:"audio/wav", url:"https://example.test/song.wav", attachment_set_id:"set1" }];
  const message = "Remove the vocals and make a backing track";
  assert.equal(hasPreparedAttachmentReflexCandidate(attachments, message), true);
  const decision = resolvePreparedAttachmentReflex({ message, attachments, capabilities:[{key:"creative.music.executeWorldClassProduction"}] });
  assert.equal(decision.intent, "execute");
  assert.equal(decision.execution.capability_key, "creative.music.executeWorldClassProduction");
  assert.equal(decision.execution.payload.source_audio, "https://example.test/song.wav");
  assert.equal(decision.execution.payload.source_rights_confirmed, true);
  assert.match(decision.response_text, /confirm that you have the rights/i);
});

test("Music execution capability can self-prepare a project and exposes broad aliases", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../lib/creative/music/capabilities/executeWorldClassMusicStudio.js", import.meta.url), "utf8"));
  assert.match(source, /ensureMusicProject/);
  assert.match(source, /creative\.studio\.inspectProject/);
  assert.match(source, /make a backing track/);
  assert.match(source, /remove the vocals/);
  assert.match(source, /separate the stems/);
});
