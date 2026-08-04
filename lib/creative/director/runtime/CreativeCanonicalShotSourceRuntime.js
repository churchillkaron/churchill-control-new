import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";
import {
  canonicalizeCreativeShotSources,
} from "../planner/canonicalizeCreativeShotSources";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.canonical-shot-source.v1",
);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;

  const originalCreate = CreativeUniversalTemporalDirectionRuntime.create.bind(
    CreativeUniversalTemporalDirectionRuntime,
  );

  Object.defineProperty(CreativeUniversalTemporalDirectionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeUniversalTemporalDirectionRuntime.create =
    async function createWithCanonicalShotSources(input = {}) {
      const result = await originalCreate(input);
      if (!result?.plan) return result;
      const plan = canonicalizeCreativeShotSources(
        result.plan,
        list(input.assets),
      );
      return {
        ...result,
        plan,
        canonical_shot_source: plan.metadata?.canonical_shot_source || null,
      };
    };
}

install();

export const CreativeCanonicalShotSourceRuntime = Object.freeze({
  installed: true,
  canonicalize: canonicalizeCreativeShotSources,
});
