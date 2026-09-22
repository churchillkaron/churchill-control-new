import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const history = await readFile(new URL("../lib/code/runtime/CodeAIMissionHistoryRuntime.js", import.meta.url), "utf8");
const capability = await readFile(new URL("../lib/platform/capabilities/createCodeAIAutonomousCapability.js", import.meta.url), "utf8");
test("mission history exposes only integrity-verified scoped architecture brain snapshots",()=>{
 assert.match(history,/loadLatestCodeAIArchitectureBrainSnapshot/);
 assert.match(history,/if \(!integrity\.valid\) continue/);
 assert.match(history,/normalizedRepository\(state\.repository_url\)/);
 assert.match(history,/current_head_revalidation_required: true/);
 assert.match(history,/authority_effect: "NONE"/);
});
test("autonomous capability feeds prior architecture brain back into the new mission",()=>{
 assert.match(capability,/loadLatestCodeAIArchitectureBrainSnapshot/);
 assert.match(capability,/prior_architecture_brain: priorArchitectureBrain/);
 assert.match(capability,/CODE_AI_ARCHITECTURE_BRAIN_HISTORY_LOAD_FAILED/);
});
