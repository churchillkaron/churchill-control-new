import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";
import {
  assertCreativeShotReferenceContract,
} from "../validation/CreativeShotReferenceContractValidator";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.fresh-direction-reference-contract.v1",
);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;

  const originalCreate = CreativeUniversalTemporalDirectionRuntime.create.bind(
    CreativeUniversalTemporalDirectionRuntime,
  );

  Object.defineProperty(
    CreativeUniversalTemporalDirectionRuntime,
    INSTALL_FLAG,
    {
      value: true,
      enumerable: false,
      configurable: false,
    },
  );

  CreativeUniversalTemporalDirectionRuntime.create =
    async function createWithFreshReferenceContract(input = {}) {
      const result = await originalCreate(input);
      if (!result?.plan) return result;

      const validation = assertCreativeShotReferenceContract({
        plan: result.plan,
        assets: list(input.assets),
      });

      return {
        ...result,
        fresh_direction_reference_contract: validation,
      };
    };
}

install();

export const CreativeFreshDirectionReferenceContractRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_SHOT_REFERENCE_CONTRACT_V1",
  validate: assertCreativeShotReferenceContract,
});
