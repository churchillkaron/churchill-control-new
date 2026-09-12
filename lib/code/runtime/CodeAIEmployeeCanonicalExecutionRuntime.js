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
import {
  retrieveCodeAIVerifiedEngineeringMemory,
} from "./CodeAIVerifiedEngineeringMemoryRuntime.js";
import {
  deriveCodeAIContractAwareDiscovery,
  CODE_AI_CONTRACT_AWARE_DISCOVERY_CONTRACT,
} from "./CodeAIContractAwareDiscoveryRuntime.js";
import {
  prepareCodeAIWorldClassMission,
  finalizeCodeAIWorldClassMission,
  CODE_AI_WORLD_CLASS_INTELLIGENCE_CONTRACT,
} from "./CodeAIWorldClassIntelligenceRuntime.js";

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
  let verifiedEngineeringMemory = options?.objective_context?.verified_engineering_memory || null;
  if (!verifiedEngineeringMemory && options?.context && options?.objective && options?.repository_url) {
    try {
      verifiedEngineeringMemory = await retrieveCodeAIVerifiedEngineeringMemory({
        context: options.context,
        objective: options.objective,
        repositoryUrl: options.repository_url,
        ref: options.ref || "main",
        excludeMissionId: options?.resume_state?.mission_id || null,
        limit: 3,
      });
    } catch {
      verifiedEngineeringMemory = null;
    }
  }
  const contractAwareDiscovery = deriveCodeAIContractAwareDiscovery({
    memory: verifiedEngineeringMemory,
  });
  const prepared = prepareCodeAIWorldClassMission({
    ...options,
    objective_context: {
      ...(options.objective_context || {}),
      ...(verifiedEngineeringMemory ? { verified_engineering_memory: verifiedEngineeringMemory } : {}),
      contract_aware_discovery: contractAwareDiscovery,
    },
  });
  const executionOptions = prepared.options;
  let result;
  if (transport.mode === "SERVERLESS_ZERO_IDLE") {
    result = await executeCodeAIEmployeeZeroIdleFastStartMission(executionOptions);
  } else if (transport.mode === "DURABLE_WARM_SESSION") {
    result = await executeCodeAIEmployeeFastStartMission(executionOptions);
  } else {
    result = await executeCodeAIEmployeeFinalReviewMission(executionOptions);
  }

  const finalizedIntelligence = finalizeCodeAIWorldClassMission({
    prepared_control: prepared.control,
    result,
    options: executionOptions,
  });

  const resultObject = result && typeof result === "object" ? result : {};
  const resultState = resultObject.state && typeof resultObject.state === "object"
    ? resultObject.state
    : null;
  return {
    ...resultObject,
    ...(resultState
      ? { state: { ...resultState, world_class_intelligence: finalizedIntelligence } }
      : {}),
    canonical_execution_contract: CODE_AI_EMPLOYEE_CANONICAL_EXECUTION_CONTRACT,
    world_class_intelligence_contract: CODE_AI_WORLD_CLASS_INTELLIGENCE_CONTRACT,
  contract_aware_discovery_contract: CODE_AI_CONTRACT_AWARE_DISCOVERY_CONTRACT,
    world_class_intelligence: finalizedIntelligence,
    execution_transport_mode: transport.mode,
    fast_start_contract:
      result?.fast_start_contract || transport.fast_start_contract || null,
    contract_aware_discovery_contract: CODE_AI_CONTRACT_AWARE_DISCOVERY_CONTRACT,
    contract_aware_discovery: contractAwareDiscovery,
  };
}

export const CodeAIEmployeeCanonicalExecutionRuntime = Object.freeze({
  contract: CODE_AI_EMPLOYEE_CANONICAL_EXECUTION_CONTRACT,
  world_class_intelligence_contract: CODE_AI_WORLD_CLASS_INTELLIGENCE_CONTRACT,
  resolveTransport: resolveCodeAIEmployeeExecutionTransport,
  execute: executeCanonicalCodeAIEmployeeMission,
});

export default executeCanonicalCodeAIEmployeeMission;
