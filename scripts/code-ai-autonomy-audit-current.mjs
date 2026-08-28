import { readFile, writeFile, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const sourcePath = "scripts/code-ai-autonomy-audit.mjs";
const source = await readFile(sourcePath, "utf8");

const replacements = [
  [
    '"service_runtime = ServiceExecutionRuntime"',
    '"serviceRuntime = service_runtime || await defaultServiceRuntime()"',
  ],
  [
    '"service_runtime.execute(executionInput)"',
    '"serviceRuntime.execute(executionInput)"',
  ],
  [
    '"Choose exactly ONE next action"',
    '"buildCodeAIPlannerPromptTransport"',
  ],
  [
    '"executeWorldClassCodeMission"',
    '"executeCodeAIEmployeeFastStartMission"',
  ],
  [
    '"Persistent GitHub commits remain a separate governed capability"',
    '"persistCodeAICommitArtifact"',
  ],
];

let adapted = source;
for (const [from, to] of replacements) {
  if (!adapted.includes(from)) {
    throw new Error(`CODE_AI_AUTONOMY_AUDIT_COMPAT_SOURCE_MARKER_MISSING:${from}`);
  }
  adapted = adapted.replace(from, to);
}

const tempPath = `/tmp/code-ai-autonomy-audit-current-${randomUUID()}.mjs`;
await writeFile(tempPath, adapted, "utf8");

try {
  await import(`${pathToFileURL(tempPath).href}?v=${Date.now()}`);
} finally {
  await unlink(tempPath).catch(() => {});
}
