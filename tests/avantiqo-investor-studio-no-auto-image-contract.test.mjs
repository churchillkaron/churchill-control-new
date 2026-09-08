import assert from "node:assert/strict";
import fs from "node:fs";
const plan=fs.readFileSync("lib/creative/post-production/runtime/AvantiqoInvestorStudioGenerationPlan.js","utf8");
const runtime=fs.readFileSync("lib/creative/post-production/runtime/AvantiqoInvestorStudioExecutionRuntime.js","utf8");
assert.ok(!plan.includes('required_generation: ["ai.image.generate", "ai.video.generate"]'));
assert.match(plan,/required_generation: \["ai.video.generate"\]/);
assert.match(runtime,/INVESTOR_STUDIO_AUTOMATIC_IMAGE_GENERATION_FORBIDDEN/);
assert.match(runtime,/automatic_image_generation_allowed: false/);
console.log("AVANTIQO_INVESTOR_STUDIO_NO_AUTO_IMAGE=PASS");
