import {
  executeCodeAIEmployeeFastStartMission,
  CODE_AI_EMPLOYEE_FAST_START_CONTRACT,
} from "./CodeAIEmployeeFastStartRuntime.js";
import {
  executeCodeAIEmployeeZeroIdleFastStartMission,
  CODE_AI_EMPLOYEE_ZERO_IDLE_FAST_START_CONTRACT,
} from "./CodeAIEmployeeZeroIdleFastStartRuntime.js";
import {
  executeCodeAIEmployeeMission as executeCodeAIEmployeeFinalReviewMission,
} from "./CodeAIEmployeeFinalReviewRuntime.js";

export const CODE_AI_EMPLOYEE_CANONICAL_EXECUTION_CONTRACT =
  "AVANTIQO_CODE_AI_EMPLOYEE_CANONICAL_EXECUTION_V1";

function text(value) {
  return String(value ?? "").trim();
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

export function resolveCodeAIEmployeeExecutionTransport(env = process.env) {
  if (enabled(env.AVANTIQO_CODE_ZERO_IDLE_SERVERLESS_ENABLED)) {
    return {
      mode: "SERVERLESS_ZERO_IDLE",
      fast_start_contract: CODE_AI_EMPLOYEE_ZERO_IDLE_FAST_START_CONTRACT,
    };
  }
  if (enabled(env.AVANTIQO_CODE_WORKER_SESSION_ENABLED)) {
    return {
      mode: "DURABLE_WARM_SESSION",
      fast_start_contract: CODE_AI_EMPLOYEE_FAST_START_CONTRACT,
    };
  }
  return {
    mode: "DIRECT_GOVERNED",
    fast_start_contract: null,
  };
}

export async function executeCanonicalCodeAIEmployeeMission(options = {}) {
  const transport = resolveCodeAIEmployeeExecutionTransport();
  let result;
  if (transport.mode === "SERVERLESS_ZERO_IDLE") {
    result = await executeCodeAIEmployeeZeroIdleFastStartMission(options);
  } else if (transport.mode === "DURABLE_WARM_SESSION") {
    result = await executeCodeAIEmployeeFastStartMission(options);
  } else {
    result = await executeCodeAIEmployeeFinalReviewMission(options);
  }

  return {
    ...(result && typeof result === "object" ? result : {}),
    canonical_execution_contract: CODE_AI_EMPLOYEE_CANONICAL_EXECUTION_CONTRACT,
    execution_transport_mode: transport.mode,
    fast_start_contract:
      result?.fast_start_contract || transport.fast_start_contract || null,
  };
}

export const CodeAIEmployeeCanonicalExecutionRuntime = Object.freeze({
  contract: CODE_AI_EMPLOYEE_CANONICAL_EXECUTION_CONTRACT,
  resolveTransport: resolveCodeAIEmployeeExecutionTransport,
  execute: executeCanonicalCodeAIEmployeeMission,
});

export default executeCanonicalCodeAIEmployeeMission;
