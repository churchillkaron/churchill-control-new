import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const reasoningService = await readFile(
  new URL("../lib/creative/reasoning/CreativeReasoningService.js", import.meta.url),
  "utf8",
);
const reasoningRuntime = await readFile(
  new URL("../lib/creative/reasoning/runtime/CreativeReasoningRuntime.js", import.meta.url),
  "utf8",
);
const serviceResolver = await readFile(
  new URL("../lib/creative/services/CreativeServiceResolver.js", import.meta.url),
  "utf8",
);
const toolRegistry = await readFile(
  new URL("../lib/creative/tools/registry/CreativeToolRegistry.js", import.meta.url),
  "utf8",
);

test("Creative reasoning is supervised by owned Avantiqo Intelligence first", () => {
  assert.match(reasoningService, /AvantiqoStructuredIntelligenceSupervisorRuntime/);
  assert.match(reasoningService, /CREATIVE_INTELLIGENCE_SUPERVISION/);
  assert.match(reasoningService, /allow_mutating_tools:\s*false/);
  assert.match(reasoningService, /avantiqo_intelligence_supervisor/);
  assert.match(reasoningService, /governed_service_runtime_fallback/);
  assert.doesNotMatch(reasoningService, /provider_selection_exposed:\s*true/);
});

test("Creative planning includes owned Voice, Audio and Code specialist capabilities", () => {
  assert.match(reasoningRuntime, /"ai\.speech\.to\.text"/);
  assert.match(reasoningRuntime, /"ai\.text\.to\.speech"/);
  assert.match(reasoningRuntime, /"ai\.music\.generate"/);
  assert.match(reasoningRuntime, /"ai\.sfx\.generate"/);
  assert.match(reasoningRuntime, /"ai\.code\.generate"/);
  assert.match(reasoningRuntime, /"ai\.web\.build"/);
  assert.match(reasoningRuntime, /sound_direction/);
  assert.match(reasoningRuntime, /specialist_sequence/);
  assert.match(reasoningRuntime, /whole_production_quality:\s*true/);
});

test("Creative task routing uses canonical owned specialist service contracts", () => {
  assert.match(serviceResolver, /IMAGE_TO_VIDEO:\s*"ai\.video\.image_to_video"/);
  assert.match(serviceResolver, /GENERATE_VOICE:\s*"ai\.text\.to\.speech"/);
  assert.match(serviceResolver, /GENERATE_MUSIC:\s*"ai\.music\.generate"/);
  assert.match(serviceResolver, /GENERATE_SFX:\s*"ai\.sfx\.generate"/);
  assert.match(serviceResolver, /SUBTITLE:\s*"ai\.speech\.to\.text"/);
});

test("Creative tool registry exposes canonical owned specialist capabilities", () => {
  for (const capability of [
    "ai.video.image_to_video",
    "ai.text.to.speech",
    "ai.speech.to.text",
    "ai.music.generate",
    "ai.sfx.generate",
    "ai.code.generate",
    "ai.code.execute",
    "ai.web.build",
    "ai.web.repair",
    "ai.app.build",
    "ai.integration.build",
  ]) {
    assert.match(toolRegistry, new RegExp(capability.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(toolRegistry, /ai\.sound-effect\.generate/);
});
