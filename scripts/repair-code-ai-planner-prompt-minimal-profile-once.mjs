import { readFile, writeFile } from "node:fs/promises";

const path = "lib/code/runtime/CodeAIPlannerPromptRuntime.js";
let source = await readFile(path, "utf8");
const replacements = [
  ['minimal ? 900 : reduced ? 1700 : MAX_REPOSITORY_GUIDANCE_INSTRUCTIONS', 'minimal ? 600 : reduced ? 1700 : MAX_REPOSITORY_GUIDANCE_INSTRUCTIONS'],
  ['minimal ? 500 : reduced ? 900 : MAX_REPOSITORY_GUIDANCE_COMMANDS', 'minimal ? 320 : reduced ? 900 : MAX_REPOSITORY_GUIDANCE_COMMANDS'],
  ['minimal ? 240 : reduced ? 400 : MAX_REPOSITORY_GUIDANCE_WORKFLOWS', 'minimal ? 160 : reduced ? 400 : MAX_REPOSITORY_GUIDANCE_WORKFLOWS'],
  ['minimal ? 300 : 600),', 'minimal ? 180 : 600),'],
  ['minimal ? 300 : 600),\n    authorization_effect', 'minimal ? 180 : 600),\n    authorization_effect'],
  ['? 1700\n    : profile === "reduced"', '? 1200\n    : profile === "reduced"'],
  ['minimal ? 900 : reduced ? 1500 : 2600', 'minimal ? 500 : reduced ? 1500 : 2600'],
  ['minimal ? 2 : reduced ? 3 : 4,', 'minimal ? 1 : reduced ? 3 : 4,'],
  ['minimal ? 3000 : reduced ? 4400 : 6400', 'minimal ? 1800 : reduced ? 4400 : 6400'],
  ['minimal ? 2 : reduced ? 3 : 4,', 'minimal ? 1 : reduced ? 3 : 4,'],
  ['minimal ? 900 : reduced ? 1700 : 3000', 'minimal ? 450 : reduced ? 1700 : 3000'],
  ['minimal ? 5 : reduced ? 6 : 8,', 'minimal ? 3 : reduced ? 6 : 8,'],
];
for (const [before, after] of replacements) {
  if (!source.includes(before)) throw new Error(`CODE_AI_MINIMAL_PROFILE_ANCHOR_MISSING:${before}`);
  source = source.replace(before, after);
}
await writeFile(path, source);
console.log("AVANTIQO_CODE_AI_PLANNER_MINIMAL_PROFILE_REPAIR=PASS");
