import { createSystemHealthCapability } from "@/lib/platform/capabilities/createSystemHealthCapability";
import { createOperatorReadChainCapability } from "@/lib/platform/capabilities/createOperatorReadChainCapability";
import { createOperatorBindingAwareMissionCapability } from "@/lib/platform/capabilities/createOperatorBindingAwareMissionCapability";
import { createOperatorOrganizationalContextCapability } from "@/lib/platform/capabilities/createOperatorOrganizationalContextCapability";
import { createOperatorAttentionCapability } from "@/lib/platform/capabilities/createOperatorAttentionCapability";
import { createOperatorWebResearchCapability } from "@/lib/platform/capabilities/createOperatorWebResearchCapability";
import { createOperatorWebSourceReadCapability } from "@/lib/platform/capabilities/createOperatorWebSourceReadCapability";
import { createOperatorResearchCompareCapability } from "@/lib/platform/capabilities/createOperatorResearchCompareCapability";
import { createCodeAIMissionCapability } from "@/lib/platform/capabilities/createCodeAIMissionCapability";
import { createCodeAIAutonomousCapability } from "@/lib/platform/capabilities/createCodeAIAutonomousCapability";
import { createCodeAICommitCapability } from "@/lib/platform/capabilities/createCodeAICommitCapability";

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
    organizational_context: {
      read: async () => createOperatorOrganizationalContextCapability(),
    },
    attention: {
      scan: async () => createOperatorAttentionCapability(),
    },
    research: {
      search: async () => createOperatorWebResearchCapability(),
    },
    research_source: {
      read: async () => createOperatorWebSourceReadCapability(),
    },
    research_compare: {
      analyze: async () => createOperatorResearchCompareCapability(),
    },
    code_ai_mission: {
      execute: async () => createCodeAIMissionCapability(),
    },
    code_ai_autonomous: {
      execute: async () => createCodeAIAutonomousCapability(),
    },
    code_ai_commit: {
      execute: async () => createCodeAICommitCapability(),
    },
    operator_read_chain: {
      execute: async () => createOperatorReadChainCapability(),
    },
    operator_mission: {
      execute: async () => createOperatorBindingAwareMissionCapability(),
    },
  },
};

export default PlatformDomainRuntime;
