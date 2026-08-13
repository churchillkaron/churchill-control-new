import { createSystemHealthCapability } from "@/lib/platform/capabilities/createSystemHealthCapability";

export const PlatformDomainRuntime = {
  domain: "platform",
  name: "Avantiqo Platform",
  version: "1.0.0",
  capabilities: {
    system: {
      inspectHealth: async () =>
        createSystemHealthCapability({
          action: "inspectHealth",
          phase: "inspection",
          description:
            "Inspect organization-scoped Avantiqo health, diagnose evidence from the database, UBTE catalog, Operations readiness, Communications delivery, and Creative production, and recommend safe next actions. This is read-only and never authorizes repair.",
        }),
      verifyHealth: async () =>
        createSystemHealthCapability({
          action: "verifyHealth",
          phase: "verification",
          description:
            "Re-run the organization-scoped Avantiqo health probes after an intervention and return fresh evidence. This is read-only and must be used before claiming a system repair succeeded.",
        }),
    },
  },
};

export default PlatformDomainRuntime;
