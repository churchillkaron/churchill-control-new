#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

const organizationId = text(process.env.CREATIVE_ORGANIZATION_ID || process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID || process.env.CREATIVE_FULL_SONG_PROJECT_ID);
const outputPath = text(process.env.CREATIVE_STORY_OUTPUT_PATH) ||
  path.join(process.cwd(), "creative-story.md");

if (!organizationId) throw new Error("CREATIVE_ORGANIZATION_ID required");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID required");

const [
  { recoverStoredCreativeStory, creativeStoryMarkdown },
  CreativeProjectRepository,
] = await Promise.all([
  import("../lib/creative/director/runtime/CreativeDirectionStoryRuntime.js"),
  import("@/lib/creative/projects/repositories/CreativeProjectRepository"),
]);

const project = await CreativeProjectRepository.getById(projectId);
if (!project || text(project.organization_id) !== organizationId) {
  throw new Error("Creative project not found in organization scope");
}

const recovered = await recoverStoredCreativeStory({
  organization_id: organizationId,
  creative_project_id: projectId,
});
const markdown = creativeStoryMarkdown({
  recovered,
  project_name: project.name || "Full-song music video",
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${markdown}\n`, "utf8");

console.log("============================================================");
console.log("STORED CREATIVE STORY");
console.log("============================================================");
console.log(markdown);
console.log("============================================================");
console.log(`STORY_FILE=${outputPath}`);
console.log(`STORY_SOURCE_USAGE_ID=${recovered.usage_id}`);
console.log("STORY_REGENERATED=NO");
console.log("RUNWAY_RECOVERY_PREFLIGHT_STARTING=YES");
console.log("============================================================");

await import("./creative-studio-runway-recovery-preflight.mjs");

console.log("PRODUCTION_RESUME_STARTING=YES");
await import("./creative-studio-full-song-resume.mjs");
