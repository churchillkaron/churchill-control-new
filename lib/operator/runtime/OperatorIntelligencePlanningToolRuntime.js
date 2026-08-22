import { OperatorIntelligenceToolBridgeRuntime } from "./OperatorIntelligenceToolBridgeRuntime";
import { OperatorIntelligenceActionCandidateRuntime } from "./OperatorIntelligenceActionCandidateRuntime";

const CONTRACT = "AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V1";

export async function createOperatorIntelligencePlanningTools(options = {}) {
  const [readTools, actionTools] = await Promise.all([
    OperatorIntelligenceToolBridgeRuntime.createReadTools(options).catch(() => []),
    OperatorIntelligenceActionCandidateRuntime.createTools(options).catch(() => []),
  ]);

  return [...readTools, ...actionTools];
}

export const OperatorIntelligencePlanningToolRuntime = Object.freeze({
  contract: CONTRACT,
  createTools: createOperatorIntelligencePlanningTools,
});
