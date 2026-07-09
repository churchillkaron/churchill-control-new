import { executeCapability } from "@/lib/ubte/capabilities/executeCapability";

/**
 * INTERNAL LEGACY COMPAT LAYER ONLY
 * DO NOT USE DIRECTLY
 */

export const PlatformExecutionEngine = {
  async execute(input) {
    return executeCapability({
      capabilityId: input.capability,
      context: input.context,
      payload: input.payload
    });
  },

  selectProvider() {
    throw new Error("DEPRECATED: use UBTE execution layer only");
  }
};
