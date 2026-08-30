import {
  CODE_AI_WORK_PACKAGE_CONTRACT,
  CODE_AI_BATCHED_AUTONOMY_CONTRACT,
  CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT,
  parseCodeAIWorkPackage,
  compactCodeAIMissionStateForPlanner,
  resolveCodeAIWorkPackageActionPolicy,
  CodeAIWorkPackageCoreRuntime,
} from "./CodeAIWorkPackageCoreRuntime.js";
import {
  executeBatchedAutonomousCodeMissionWithDeterministicConvergence,
  CodeAIWorkPackageDeterministicConvergenceRuntime,
} from "./CodeAIWorkPackageDeterministicConvergenceRuntime.js";
import {
  executeCodeAIStrategicBatchedMission,
  CodeAIStrategicReasoningRuntime,
  CODE_AI_STRATEGIC_REASONING_CONTRACT,
} from "./CodeAIStrategicReasoningRuntime.js";

export {
  CODE_AI_WORK_PACKAGE_CONTRACT,
  CODE_AI_BATCHED_AUTONOMY_CONTRACT,
  CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT,
  CODE_AI_STRATEGIC_REASONING_CONTRACT,
  parseCodeAIWorkPackage,
  compactCodeAIMissionStateForPlanner,
  resolveCodeAIWorkPackageActionPolicy,
  CodeAIWorkPackageCoreRuntime,
  CodeAIStrategicReasoningRuntime,
};

export const executeBatchedAutonomousCodeMission =
  executeCodeAIStrategicBatchedMission;

export const CodeAIWorkPackageRuntime = Object.freeze({
  ...CodeAIWorkPackageDeterministicConvergenceRuntime,
  execute: executeCodeAIStrategicBatchedMission,
  strategic_reasoning_contract: CODE_AI_STRATEGIC_REASONING_CONTRACT,
  strategic_reasoning: true,
  deterministic_convergence_execute:
    executeBatchedAutonomousCodeMissionWithDeterministicConvergence,
  control_contract: CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT,
  max_package_operations: CodeAIWorkPackageCoreRuntime.max_package_operations,
  allowed_package_actions: CodeAIWorkPackageCoreRuntime.allowed_package_actions,
  implementation_actions: CodeAIWorkPackageCoreRuntime.implementation_actions,
});

export default CodeAIWorkPackageRuntime;