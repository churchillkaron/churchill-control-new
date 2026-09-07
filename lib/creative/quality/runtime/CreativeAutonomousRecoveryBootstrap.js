import {
  CreativeAutonomousRepairDirectorRuntime,
} from "./CreativeAutonomousRepairDirectorRuntime";
import {
  CreativeAutonomousRecoveryOrchestratorRuntime,
} from "./CreativeAutonomousRecoveryOrchestratorRuntime";

const FLAG = Symbol.for("avantiqo.creative.autonomous-recovery-bootstrap.v1");

if (!CreativeAutonomousRepairDirectorRuntime[FLAG]) {
  const ensureWithoutRecoveryEvidence = CreativeAutonomousRepairDirectorRuntime.ensure.bind(
    CreativeAutonomousRepairDirectorRuntime,
  );
  Object.defineProperty(CreativeAutonomousRepairDirectorRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeAutonomousRepairDirectorRuntime.ensure = async function ensureWithRecoveryDecision(input = {}) {
    const recovery = await CreativeAutonomousRecoveryOrchestratorRuntime.analyze(input);
    const result = await ensureWithoutRecoveryEvidence(input);
    return {
      ...result,
      autonomous_recovery: recovery,
      recovery_contract: CreativeAutonomousRecoveryOrchestratorRuntime.contract,
      blind_retry_forbidden: true,
      quality_floor_may_be_lowered: false,
    };
  };
}

export const CreativeAutonomousRecoveryBootstrap = Object.freeze({
  installed: true,
  contract: "AVANTIQO_AUTONOMOUS_RECOVERY_BOOTSTRAP_V1",
  recovery_contract: CreativeAutonomousRecoveryOrchestratorRuntime.contract,
});
