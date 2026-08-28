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
  executeBatchedAutonomousCodeMissionLive,
  CodeAIWorkPackageRuntimeLive,
} from "./CodeAIWorkPackageRuntimeLive.js";

export {
  CODE_AI_WORK_PACKAGE_CONTRACT,
  CODE_AI_BATCHED_AUTONOMY_CONTRACT,
  CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT,
  parseCodeAIWorkPackage,
  compactCodeAIMissionStateForPlanner,
  resolveCodeAIWorkPackageActionPolicy,
  CodeAIWorkPackageCoreRuntime,
};

export const executeBatchedAutonomousCodeMission =
  executeBatchedAutonomousCodeMissionLive;

export const CodeAIWorkPackageRuntime = Object.freeze({
  ...CodeAIWorkPackageRuntimeLive,
  control_contract: CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT,
  allowed_package_actions: CodeAIWorkPackageCoreRuntime.allowed_package_actions,
  implementation_actions: CodeAIWorkPackageCoreRuntime.implementation_actions,
});

export default CodeAIWorkPackageRuntime;
