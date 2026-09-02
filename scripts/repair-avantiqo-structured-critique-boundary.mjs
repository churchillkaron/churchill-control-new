#!/usr/bin/env node

import fs from "node:fs";

const CONTRACT = "AVANTIQO_STRUCTURED_CRITIQUE_BOUNDARY_REPAIR_V1";

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${CONTRACT}_${label}_EXPECTED_ONCE_FOUND_${count}`);
  }
  return source.replace(before, after);
}

function patchFile(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`${CONTRACT}_${path}_UNCHANGED`);
  fs.writeFileSync(path, after);
}

patchFile("lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime.js", (source) => {
  let next = replaceExact(
    source,
    '      "Use governed tools if another observation is necessary. Return a concise corrected decision brief, not JSON.",',
    '      "Do not call tools in critique/repair. If another observation would be necessary, preserve it as an explicit evidence gap for the caller; do not fetch it. Return a concise corrected decision brief.",',
    "DEFAULT_CRITIQUE_TOOL_POLICY",
  );

  next = replaceExact(
    next,
`    critiqueRepair = await reasoningPhase({
      organization_id,
      party_id,
      entity_id,
      system,
      messages: [
        ...conversation,
        { role: "assistant", content: decisionBrief },
        { role: "user", content: critique },
      ],
      tools,
      authorization,
      metadata,
      mode: normalizedMode,
      name: "critique_repair",
      max_output_tokens: compilerTokenBudget(metadata, tokenBudget),
      execution_lane: "fast",
    });`,
`    critiqueRepair = await AvantiqoIntelligenceReasoningRuntime.run({
      organization_id,
      party_id,
      entity_id,
      system: [
        text(system, 50000),
        "CRITIQUE_REPAIR_PHASE_BOUNDARY",
        "Review only the supplied decision brief against the user's goal, caller constraints and evidence already collected by reason_act_observe.",
        "Do not call tools. Any earlier instruction to use tools applies only to reason_act_observe and is disabled for critique_repair.",
        "If evidence is missing, preserve it as an explicit evidence gap for the caller instead of fetching it.",
        "Do not invent facts, approvals, execution results, capabilities or completed work.",
        "Return only the corrected decision brief. A following compiler owns the final JSON machine boundary.",
      ].join("\\n"),
      messages: [
        ...conversation,
        {
          role: "assistant",
          content: \`DECISION_BRIEF_TO_REVIEW\\n\${text(decisionBrief, 24000)}\`,
        },
        { role: "user", content: critique },
      ],
      tools: [],
      authorization: { allow_mutating_tools: false },
      metadata: {
        ...object(metadata),
        structured_supervisor_contract: CONTRACT,
        structured_supervisor_phase: "critique_repair",
        structured_supervisor_mode: "bounded_fast_critic",
        structured_supervisor_execution_lane: "fast",
        structured_boundary_compilation: false,
        critique_tools_allowed: false,
        private_reasoning_transport_expected: false,
        bounded_non_thinking_fast_lane: true,
        raw_reasoning_persisted: false,
      },
      execution_lane: "fast",
      temperature: 0.1,
      max_output_tokens: compilerTokenBudget(metadata, tokenBudget),
      max_turns: 1,
      max_tool_calls: 1,
    });`,
    "CRITIQUE_EXECUTION_BOUNDARY",
  );

  return next;
});

patchFile("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", (source) =>
  replaceExact(
    source,
    '        "If another safe registered live read is necessary, use it. If recommending a concrete action, validate it with operator_action_candidate.",',
    '        "Critique/repair is tool-free. If another live read or action-candidate validation would be necessary, preserve it explicitly in evidence_needed or plan_steps for the governed Operator; do not call tools in this phase.",',
    "COGNITIVE_CRITIQUE_TOOL_POLICY",
  ),
);

const testPath = "tests/avantiqo-structured-critique-boundary.test.mjs";
fs.writeFileSync(testPath, `import assert from "node:assert/strict";\nimport fs from "node:fs";\nimport test from "node:test";\n\nconst supervisor = fs.readFileSync(\n  new URL("../lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime.js", import.meta.url),\n  "utf8",\n);\nconst synthetic = fs.readFileSync(\n  new URL("../lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", import.meta.url),\n  "utf8",\n);\n\ntest("critique_repair is a one-shot tool-free Fast phase", () => {\n  const marker = 'structured_supervisor_phase: "critique_repair"';\n  const index = supervisor.indexOf(marker);\n  assert.ok(index >= 0, "critique_repair metadata marker missing");\n  const start = Math.max(0, supervisor.lastIndexOf("AvantiqoIntelligenceReasoningRuntime.run({", index));\n  const end = supervisor.indexOf("});", index) + 3;\n  const block = supervisor.slice(start, end);\n  assert.match(block, /tools:\\s*\\[\\]/);\n  assert.match(block, /execution_lane:\\s*"fast"/);\n  assert.match(block, /max_turns:\\s*1/);\n  assert.match(block, /max_tool_calls:\\s*1/);\n  assert.match(block, /critique_tools_allowed:\\s*false/);\n  assert.doesNotMatch(block, /\\n\\s*tools,\\n/);\n});\n\ntest("critique_repair explicitly treats missing evidence as a gap rather than a tool request", () => {\n  assert.match(supervisor, /CRITIQUE_REPAIR_PHASE_BOUNDARY/);\n  assert.match(supervisor, /Do not call tools/);\n  assert.match(supervisor, /preserve it as an explicit evidence gap/);\n  assert.doesNotMatch(supervisor, /Use governed tools if another observation is necessary/);\n});\n\ntest("Operator cognitive critique instructions no longer request live reads during critique", () => {\n  assert.match(synthetic, /Critique\\/repair is tool-free/);\n  assert.match(synthetic, /preserve it explicitly in evidence_needed or plan_steps/);\n  assert.doesNotMatch(synthetic, /If another safe registered live read is necessary, use it/);\n});\n`);

console.log(`${CONTRACT}=PASS`);
