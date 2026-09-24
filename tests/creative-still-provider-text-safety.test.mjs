import assert from "node:assert/strict";
import test from "node:test";
import { serializeCreativeProviderInstruction } from "../lib/creative/execution/runtime/CreativeProviderInstructionSerializer.js";

test("still image provider instruction excludes Studio task labels and descriptions", () => {
  const instruction = serializeCreativeProviderInstruction({
    capability: "ai.image.generate",
    type: "KEYFRAME",
    title: "The Breath After Stillness · Shot 01 Hero Frame · Take 2",
    description: "STUDIO UI DESCRIPTION THAT MUST NEVER BECOME PIXELS",
    intent: {
      subject: "vast ancient desert valley before dawn, still and empty",
      action: "no visible action",
      purpose: "opening frame authority",
    },
    requirements: {
      camera: "wide landscape master",
      lighting: "soft pre-dawn natural light",
      production_design: { materials: ["weathered stone", "dry earth"] },
      negative_constraints: ["no text", "no logos", "no UI"],
    },
  });

  assert.doesNotMatch(instruction, /The Breath After Stillness/);
  assert.doesNotMatch(instruction, /STUDIO UI DESCRIPTION/);
  assert.match(instruction, /vast ancient desert valley before dawn/);
  assert.doesNotMatch(instruction, /camera operator|photographer|cinema camera|nightclub|dashboard|watermark/i);
  assert.match(instruction, /photoreal cinematic landscape still/i);
  assert.doesNotMatch(instruction, /Compact cinematic frame contract|\{\"intent\"/i);
});
