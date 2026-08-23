import process from "node:process";
import { writeFile } from "node:fs/promises";

function text(value) {
  return String(value ?? "").trim();
}

function sceneList(value) {
  const raw = text(value);
  if (!raw || raw.toLowerCase() === "all") return undefined;
  const values = raw
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isInteger(entry));
  if (!values.length) throw new Error("INVESTOR_STUDIO_SCENES_INVALID");
  return [...new Set(values)];
}

const mode = text(process.env.INVESTOR_STUDIO_MODE || process.argv[2] || "prepare").toLowerCase();
const scenes = sceneList(process.env.INVESTOR_STUDIO_SCENES || process.argv[3]);
const spendApproved = text(process.env.INVESTOR_STUDIO_SPEND_APPROVED).toUpperCase() === "YES";
const resultPath = text(process.env.INVESTOR_STUDIO_RESULT_PATH);

if (!["prepare", "execute"].includes(mode)) {
  throw new Error(`INVESTOR_STUDIO_MODE_INVALID:${mode}`);
}

const {
  prepareInvestorStudioScenes,
  executeInvestorStudioScenes,
} = await import("@/lib/creative/post-production/runtime/AvantiqoInvestorStudioExecutionRuntime");
const {
  CreativeMissionRuntime,
} = await import("@/lib/creative/missions/runtime/CreativeMissionRuntime");

async function startPreparedStudioMissions(preparation = {}) {
  const prepared = Array.isArray(preparation?.prepared)
    ? preparation.prepared.filter(Boolean)
    : [];

  for (const entry of prepared) {
    const missionId = text(entry?.mission_id);
    if (!missionId) throw new Error("INVESTOR_STUDIO_PREPARED_MISSION_REQUIRED");
    const started = await CreativeMissionRuntime.start(missionId);
    const projectId = text(started?.runtime_context?.creative_project_id);
    if (!projectId) {
      throw new Error(`INVESTOR_STUDIO_STARTED_PROJECT_REQUIRED:${missionId}`);
    }
    console.log(
      `STUDIO_MISSION_STARTED=${missionId} PROJECT=${projectId} QUALITY_POLICY=RESOLVED`,
    );
  }

  return preparation;
}

console.log("============================================================");
console.log("AVANTIQO INVESTOR FILM - STUDIO SCENES");
console.log("============================================================");
console.log(`MODE=${mode.toUpperCase()}`);
console.log(`SCENES=${scenes?.join(",") || "PLAN_DEFAULT"}`);
console.log(`SPEND_APPROVED=${spendApproved ? "YES" : "NO"}`);
console.log("");

let result;
if (mode === "execute") {
  if (!spendApproved) throw new Error("INVESTOR_STUDIO_SPEND_APPROVAL_REQUIRED");

  const preparation = await prepareInvestorStudioScenes({ scenes });
  await startPreparedStudioMissions(preparation);

  result = await executeInvestorStudioScenes({
    scenes,
    spendApproved,
    maxTasksPerScene: Number(process.env.INVESTOR_STUDIO_MAX_TASKS || 24),
    maxPassesPerScene: Number(process.env.INVESTOR_STUDIO_MAX_PASSES || 60),
  });
} else {
  result = await prepareInvestorStudioScenes({ scenes });
}

const serialized = `${JSON.stringify(result, null, 2)}\n`;
console.log(serialized);

if (resultPath) {
  await writeFile(resultPath, serialized, "utf8");
  console.log(`RESULT_PATH=${resultPath}`);
}

if (mode === "execute" && result?.success !== true) {
  process.exitCode = 1;
}
