import { readFile, writeFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_OPERATOR_MODAL_SETTLEMENT_REPAIR_V1";
const REASONING_PATH = "lib/operator/runtime/OperatorReasoningRuntime.js";
const FAST_PATH = "lib/operator/runtime/OperatorFastConversationRuntime.js";

function replaceExactlyOnce(source, before, after, code) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${CONTRACT}_${code}_SOURCE_NOT_FOUND`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${CONTRACT}_${code}_SOURCE_NOT_UNIQUE`);
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

async function patchReasoning() {
  let source = await readFile(REASONING_PATH, "utf8");

  source = replaceExactlyOnce(
    source,
    'import {\n  parseOperatorReasoningResponse,\n} from "./OperatorReasoningResponseParser";\n',
    'import {\n  parseOperatorReasoningResponse,\n} from "./OperatorReasoningResponseParser";\nimport {\n  ownedOperatorIntelligenceSelectionPolicy,\n  settleOperatorIntelligenceExecution,\n} from "./OperatorOwnedIntelligenceServiceRuntime";\n',
    "REASONING_IMPORT",
  );

  source = replaceExactlyOnce(
    source,
    'function localDevelopmentOwnedReasoningPolicy() {\n  if (text(process.env.NODE_ENV).toLowerCase() !== "development") return null;\n  return {\n    provider_id: OWNED_INTELLIGENCE_PROVIDER,\n    provider_policy: {\n      allowed_providers: [OWNED_INTELLIGENCE_PROVIDER],\n      execution_scope: LOCAL_REVIEW_SCOPE,\n      benchmark_only: true,\n      owned_only_required: true,\n      external_fallback_allowed: false,\n    },\n  };\n}\n',
    'function localDevelopmentOwnedReasoningPolicy() {\n  return ownedOperatorIntelligenceSelectionPolicy();\n}\n',
    "REASONING_POLICY",
  );

  source = replaceExactlyOnce(
    source,
    '      const fastExecution = await ServiceExecutionRuntime.execute({\n        organization_id: organizationId,',
    '      let fastExecution = await ServiceExecutionRuntime.execute({\n        organization_id: organizationId,',
    "FAST_EXECUTION_MUTABLE",
  );

  source = replaceExactlyOnce(
    source,
    '        service_id: "ai.text.generate",\n        input: {',
    '        service_id: "ai.text.generate",\n        ...ownedOperatorIntelligenceSelectionPolicy(),\n        input: {',
    "FAST_OWNED_SELECTION",
  );

  source = replaceExactlyOnce(
    source,
    '        category: "AI",\n      });\n\n      const fastParsed = parseOperatorReasoningResponse(findText(fastExecution));',
    '        category: "AI",\n      });\n\n      fastExecution = await settleOperatorIntelligenceExecution({\n        organization_id: organizationId,\n        execution: fastExecution,\n        service_id: "ai.text.generate",\n        execution_lane: "fast",\n        metadata: {\n          module: "OPERATOR",\n          operation: "REASON_TURN_FAST_SETTLEMENT",\n          channel: text(source) || "text",\n          raw_reasoning_persisted: false,\n        },\n      });\n\n      const fastParsed = parseOperatorReasoningResponse(findText(fastExecution));',
    "FAST_SETTLEMENT",
  );

  source = replaceExactlyOnce(
    source,
    '  const execution = await ServiceExecutionRuntime.execute({\n    organization_id: organizationId,',
    '  let execution = await ServiceExecutionRuntime.execute({\n    organization_id: organizationId,',
    "DEEP_EXECUTION_MUTABLE",
  );

  source = replaceExactlyOnce(
    source,
    '    category: "AI",\n  });\n\n  const rawText = findText(execution);',
    '    category: "AI",\n  });\n\n  execution = await settleOperatorIntelligenceExecution({\n    organization_id: organizationId,\n    execution,\n    service_id: "ai.reasoning.execute",\n    execution_lane: "deep",\n    metadata: {\n      module: "OPERATOR",\n      operation: "REASON_TURN_SETTLEMENT",\n      channel: text(source) || "text",\n      raw_reasoning_persisted: false,\n    },\n  });\n\n  const rawText = findText(execution);',
    "DEEP_SETTLEMENT",
  );

  await writeFile(REASONING_PATH, source, "utf8");
}

async function patchFastConversation() {
  let source = await readFile(FAST_PATH, "utf8");

  source = replaceExactlyOnce(
    source,
    'import {\n  ServiceExecutionRuntime,\n} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";\n',
    'import {\n  ServiceExecutionRuntime,\n} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";\nimport {\n  ownedOperatorIntelligenceSelectionPolicy,\n  settleOperatorIntelligenceExecution,\n} from "./OperatorOwnedIntelligenceServiceRuntime";\n',
    "FAST_CONVERSATION_IMPORT",
  );

  source = replaceExactlyOnce(
    source,
    '  const execution = await ServiceExecutionRuntime.execute({\n    organization_id: organizationId,',
    '  let execution = await ServiceExecutionRuntime.execute({\n    organization_id: organizationId,',
    "FAST_CONVERSATION_EXECUTION_MUTABLE",
  );

  source = replaceExactlyOnce(
    source,
    '    service_id: "ai.text.generate",\n    input: {',
    '    service_id: "ai.text.generate",\n    ...ownedOperatorIntelligenceSelectionPolicy(),\n    input: {',
    "FAST_CONVERSATION_OWNED_SELECTION",
  );

  source = replaceExactlyOnce(
    source,
    '    category: "AI",\n  });\n\n  const responseText = findText(execution);',
    '    category: "AI",\n  });\n\n  execution = await settleOperatorIntelligenceExecution({\n    organization_id: organizationId,\n    execution,\n    service_id: "ai.text.generate",\n    execution_lane: "fast",\n    metadata: {\n      module: "OPERATOR",\n      operation: strategic ? "FAST_PROJECT_CONVERSATION_SETTLEMENT" : "FAST_CONVERSATION_SETTLEMENT",\n      channel,\n      raw_reasoning_persisted: false,\n    },\n  });\n\n  const responseText = findText(execution);',
    "FAST_CONVERSATION_SETTLEMENT",
  );

  await writeFile(FAST_PATH, source, "utf8");
}

await patchReasoning();
await patchFastConversation();

console.log(`${CONTRACT}=PASS`);
