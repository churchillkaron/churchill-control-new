import {
  CreativeAutonomousRepairDirectorRuntime,
} from "./CreativeAutonomousRepairDirectorRuntime";
import {
  CreativeGeneratedMediaPerceptualPairRecoveryRuntime,
} from "./CreativeGeneratedMediaPerceptualPairRecoveryRuntime";

const FLAG = Symbol.for(
  "avantiqo.creative.perceptual-pair-recovery-priority.v1",
);
const CONTRACT = "CREATIVE_PERCEPTUAL_PAIR_RECOVERY_PRIORITY_V1";

function taggedPairRepair(item = {}) {
  return {
    ...item,
    repair_kind: "GENERATED_MEDIA_PERCEPTUAL_PAIR",
  };
}

function install() {
  if (CreativeAutonomousRepairDirectorRuntime[FLAG]) return;

  const ensureGeneric = CreativeAutonomousRepairDirectorRuntime.ensure.bind(
    CreativeAutonomousRepairDirectorRuntime,
  );
  Object.defineProperty(CreativeAutonomousRepairDirectorRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeAutonomousRepairDirectorRuntime.ensure = async function ensurePairFirst(
    input = {},
  ) {
    const pair = await CreativeGeneratedMediaPerceptualPairRecoveryRuntime.ensure(
      input,
    );

    if (pair.unresolved_pair_count > 0) {
      return {
        created: pair.created.map(taggedPairRepair),
        blocked: [
          ...pair.blocked,
          {
            reason: "GENERIC_REPAIR_SUPPRESSED_WHILE_PERCEPTUAL_PAIR_UNRESOLVED",
            unresolved_pair_count: pair.unresolved_pair_count,
          },
        ],
        pair_recovery: pair,
        policy: {
          version: CONTRACT,
          allow_automatic_repair: true,
          perceptual_pair_priority: true,
        },
        enabled: true,
      };
    }

    const generic = await ensureGeneric(input);
    return {
      ...generic,
      created: [
        ...pair.created.map(taggedPairRepair),
        ...(Array.isArray(generic.created) ? generic.created : []),
      ],
      blocked: [
        ...pair.blocked,
        ...(Array.isArray(generic.blocked) ? generic.blocked : []),
      ],
      pair_recovery: pair,
    };
  };
}

install();

export const CreativePerceptualPairRecoveryBootstrap = Object.freeze({
  installed: true,
  contract: CONTRACT,
  pair_recovery_contract:
    CreativeGeneratedMediaPerceptualPairRecoveryRuntime.contract,
});
