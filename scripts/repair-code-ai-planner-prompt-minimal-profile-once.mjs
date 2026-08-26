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

const failure = `  throw new Error(\n    \`CODE_AI_AUTONOMOUS_PLANNER_STATE_BUDGET_EXCEEDED:\${maximumChars}\`,\n  );`;
if (!source.includes(failure)) throw new Error("CODE_AI_PROMPT_EMERGENCY_COMPACTION_ANCHOR_MISSING");
const emergency = `  const critical = transportState(state, repositoryGuidance, "minimal");
  critical.transport_compaction_profile = "critical";
  critical.tests = list(critical.tests).slice(-1).map((entry) => ({
    ...object(entry),
    stdout: boundedText(entry?.stdout, 160),
    stderr: boundedText(entry?.stderr, 160),
  }));
  critical.failures = list(critical.failures).slice(-2);
  critical.repairs = list(critical.repairs).slice(-2);
  critical.blockers = list(critical.blockers).slice(-3);
  critical.verification = list(critical.verification).slice(-3);
  critical.evidence = list(critical.evidence).slice(-1);
  critical.repository_guidance = {
    ...object(critical.repository_guidance),
    instructions_text: boundedText(critical.repository_guidance?.instructions_text, 320),
    verification_commands_text: boundedText(critical.repository_guidance?.verification_commands_text, 220),
    ci_workflows_text: boundedText(critical.repository_guidance?.ci_workflows_text, 120),
    monorepo_summary: boundedText(critical.repository_guidance?.monorepo_summary, 120),
    instruction_scope_rule: boundedText(critical.repository_guidance?.instruction_scope_rule, 160),
  };
  critical.source_read_evidence = list(critical.source_read_evidence).slice(-1).map((entry) => ({
    ...object(entry),
    result: {
      ...object(entry?.result),
      content: boundedText(entry?.result?.content, 900),
      content_truncated_for_transport: true,
    },
  }));
  const criticalSerialized = jsonText(critical);
  if (criticalSerialized.length <= maximumChars) return criticalSerialized;
  throw new Error(
    \`CODE_AI_AUTONOMOUS_PLANNER_STATE_BUDGET_EXCEEDED:\${maximumChars}:critical=\${criticalSerialized.length}\`,
  );`;
source = source.replace(failure, emergency);
await writeFile(path, source);
console.log("AVANTIQO_CODE_AI_PLANNER_MINIMAL_PROFILE_REPAIR=PASS");
