const DISABLED_ERROR =
  "LEGACY_CREATIVE_DIRECTION_RELIABLE_OUTPUT_PATCH_DISABLED";

export async function preflightCreativeDirectionOutput() {
  throw new Error(DISABLED_ERROR);
}

export function installCreativeDirectionReliableOutputPatch() {
  throw new Error(DISABLED_ERROR);
}

export const CreativeDirectionReliableOutputPatch = Object.freeze({
  disabled: true,
  reason:
    "Historical creative-direction reuse and automatic repair can reintroduce stale shot identities, references and project-specific defaults. Fresh canonical direction is required.",
  install: installCreativeDirectionReliableOutputPatch,
  preflight: preflightCreativeDirectionOutput,
});
