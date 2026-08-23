import process from "node:process";

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

if (!["prepare", "execute"].includes(mode)) {
  throw new Error(`INVESTOR_STUDIO_MODE_INVALID:${mode}`);
}

const {
  prepareInvestorStudioScenes,
  executeInvestorStudioScenes,
} = await import("@/lib/creative/post-production/runtime/AvantiqoInvestorStudioExecutionRuntime");

console.log("============================================================");
console.log("AVANTIQO INVESTOR FILM - STUDIO SCENES");
console.log("============================================================");
console.log(`MODE=${mode.toUpperCase()}`);
console.log(`SCENES=${scenes?.join(",") || "PLAN_DEFAULT"}`);
console.log(`SPEND_APPROVED=${spendApproved ? "YES" : "NO"}`);
console.log("");

const result = mode === "execute"
  ? await executeInvestorStudioScenes({
      scenes,
      spendApproved,
      maxTasksPerScene: Number(process.env.INVESTOR_STUDIO_MAX_TASKS || 24),
      maxPassesPerScene: Number(process.env.INVESTOR_STUDIO_MAX_PASSES || 60),
    })
  : await prepareInvestorStudioScenes({ scenes });

console.log(JSON.stringify(result, null, 2));

if (mode === "execute" && result?.success !== true) {
  process.exitCode = 1;
}
