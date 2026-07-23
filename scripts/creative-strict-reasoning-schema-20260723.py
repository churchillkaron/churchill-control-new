from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    file.write_text(text.replace(old, new, 1))


reasoning = "lib/creative/reasoning/CreativeReasoningService.js"
provider = "lib/platform/service-runtime/providers/openai/OpenAIProvider.js"

replace_once(
    reasoning,
    'import {\n  ServiceExecutionRuntime,\n} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";\n',
    'import {\n  ServiceExecutionRuntime,\n} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";\n\nimport {\n  compileCreativeStructuredOutputContract,\n  decodeCreativeStructuredOutput,\n  assertCreativeStructuredOutput,\n} from "./CreativeStructuredOutputContract";\n',
)

replace_once(
    reasoning,
    '  const executionTimeout = positiveInteger(\n    timeoutMs,\n    DEFAULT_TIMEOUT_MS,\n  );\n\n  let execution;\n',
    '  const executionTimeout = positiveInteger(\n    timeoutMs,\n    DEFAULT_TIMEOUT_MS,\n  );\n  const structuredContract =\n    compileCreativeStructuredOutputContract({\n      outputShape,\n      name:\n        metadata.structured_output_name ||\n        metadata.creative_director_step_key ||\n        metadata.operation ||\n        "creative_reasoning",\n      description:\n        metadata.structured_output_description ||\n        `Strict structured output for ${String(task || "creative reasoning").slice(0, 180)}`,\n    });\n\n  let execution;\n',
)

replace_once(
    reasoning,
    '          response_format: {\n            type: "json_object",\n          },\n',
    '          response_format:\n            structuredContract.response_format,\n',
)

replace_once(
    reasoning,
    '          reasoning_max_output_tokens: tokenBudget,\n          ...metadata,\n',
    '          reasoning_max_output_tokens: tokenBudget,\n          structured_output_contract_version:\n            structuredContract.version,\n          structured_output_contract_name:\n            structuredContract.name,\n          structured_output_strict: true,\n          ...metadata,\n',
)

replace_once(
    reasoning,
    '  const parsed =\n    parseJson(structuredOutput(execution)) ||\n    parseJson(outputText(execution));\n\n  if (!parsed) {\n',
    '  const parsed =\n    parseJson(structuredOutput(execution)) ||\n    parseJson(outputText(execution));\n\n  if (!parsed) {\n',
)

replace_once(
    reasoning,
    '  return {\n    provider: "openai",\n    model,\n    task,\n    confidence: Number(parsed.confidence || 70),\n    fallback: false,\n    recovery: false,\n    recovery_source: null,\n    fallback_reason: null,\n    token_budget: tokenBudget,\n    timeout_ms: executionTimeout,\n    result: parsed.result || parsed,\n  };\n',
    '  let decoded;\n  let validation;\n\n  try {\n    decoded = decodeCreativeStructuredOutput(parsed);\n    validation = assertCreativeStructuredOutput({\n      value: decoded,\n      outputShape,\n    });\n  } catch (error) {\n    return missionDirectedRecovery({\n      task,\n      input,\n      reason: `CREATIVE_REASONING_SCHEMA_REJECTED:${JSON.stringify({\n        code: error.code || error.message,\n        details: error.details || null,\n        contract_version: structuredContract.version,\n        contract_name: structuredContract.name,\n      })}`,\n    });\n  }\n\n  return {\n    provider: "openai",\n    model,\n    task,\n    confidence: Number(decoded.confidence || 70),\n    fallback: false,\n    recovery: false,\n    recovery_source: null,\n    fallback_reason: null,\n    token_budget: tokenBudget,\n    timeout_ms: executionTimeout,\n    structured_output_contract: {\n      version: structuredContract.version,\n      name: structuredContract.name,\n      strict: true,\n      validation,\n    },\n    result: decoded.result || decoded,\n  };\n',
)

replace_once(
    provider,
    '    output: {\n      text,\n      json,\n      response_format: format?.type || "text",\n      response_status: response.status || null,\n      incomplete_details: response.incomplete_details || null,\n    },\n',
    '    output: {\n      text,\n      json,\n      response_format: format?.type || "text",\n      response_format_name:\n        format?.name || null,\n      response_format_strict:\n        format?.strict === true,\n      response_status: response.status || null,\n      incomplete_details: response.incomplete_details || null,\n    },\n',
)
