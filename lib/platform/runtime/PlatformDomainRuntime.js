import { createSystemHealthCapability } from "@/lib/platform/capabilities/createSystemHealthCapability";
import { createOperatorReadChainCapability } from "@/lib/platform/capabilities/createOperatorReadChainCapability";
import { createOperatorBindingAwareMissionCapability } from "@/lib/platform/capabilities/createOperatorBindingAwareMissionCapability";
import { createOperatorOrganizationalContextCapability } from "@/lib/platform/capabilities/createOperatorOrganizationalContextCapability";
import { createOperatorAttentionCapability } from "@/lib/platform/capabilities/createOperatorAttentionCapability";
import { createOperatorWebResearchCapability } from "@/lib/platform/capabilities/createOperatorWebResearchCapability";
import { createOperatorWebSourceReadCapability } from "@/lib/platform/capabilities/createOperatorWebSourceReadCapability";
import { createOperatorResearchCompareCapability } from "@/lib/platform/capabilities/createOperatorResearchCompareCapability";
import { createProductAutonomyAssessmentCapability } from "@/lib/platform/capabilities/createProductAutonomyAssessmentCapability";
import { createProductRepositoryAssessmentCapability } from "@/lib/platform/capabilities/createProductRepositoryAssessmentCapability";
import { createProductPersistenceDecisionCapability } from "@/lib/platform/capabilities/createProductPersistenceDecisionCapability";
import { createProductPersistenceHandoffCapability } from "@/lib/platform/capabilities/createProductPersistenceHandoffCapability";
import { createProductAutonomyContinuationCapability } from "@/lib/platform/capabilities/createProductAutonomyContinuationCapability";
import { createProductEngineeringCycleCapability } from "@/lib/platform/capabilities/createProductEngineeringCycleCapability";
import { createCodeAIMissionCapability } from "@/lib/platform/capabilities/createCodeAIMissionCapability";
import { createCodeAIAutonomousCapability } from "@/lib/platform/capabilities/createCodeAIAutonomousCapability";
import { createCodeAIAutonomousStatusCapability } from "@/lib/platform/capabilities/createCodeAIAutonomousStatusCapability";
import { createCodeAICommitCapability } from "@/lib/platform/capabilities/createCodeAICommitCapability";
import { createCodeAICommitStatusCapability } from "@/lib/platform/capabilities/createCodeAICommitStatusCapability";
import { createSecretaryCapability } from "@/lib/platform/capabilities/createSecretaryCapability";
import { createSecretaryCorrespondenceCapability } from "@/lib/platform/capabilities/createSecretaryCorrespondenceCapability";
import { createSecretaryExecutiveBriefingCapability } from "@/lib/platform/capabilities/createSecretaryExecutiveBriefingCapability";
import { createSecretaryJobCapability } from "@/lib/platform/capabilities/createSecretaryJobCapability";
import { createSecretaryMeetingPreparationCapability } from "@/lib/platform/capabilities/createSecretaryMeetingPreparationCapability";
import { createSecretaryOutboundCallCapability } from "@/lib/platform/capabilities/createSecretaryOutboundCallCapability";
import { createSecretaryPaperworkCapability } from "@/lib/platform/capabilities/createSecretaryPaperworkCapability";
import { createSecretaryPaperworkStatusCapability } from "@/lib/platform/capabilities/createSecretaryPaperworkStatusCapability";
import { createSecretaryTravelCapability } from "@/lib/platform/capabilities/createSecretaryTravelCapability";

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
    product_autonomy: {
      assess: async () => createProductAutonomyAssessmentCapability(),
    },
    product_repository_assessment: {
      read: async () => createProductRepositoryAssessmentCapability(),
    },
    product_persistence_decision: {
      assess: async () => createProductPersistenceDecisionCapability(),
    },
    product_persistence_handoff: {
      execute: async () => createProductPersistenceHandoffCapability(),
    },
    product_autonomy_continuation: {
      assess: async () => createProductAutonomyContinuationCapability(),
    },
    product_engineering_cycle: {
      execute: async () => createProductEngineeringCycleCapability(),
    },
    code_ai_mission: {
      execute: async () => createCodeAIMissionCapability(),
    },
    code_ai_autonomous: {
      execute: async () => createCodeAIAutonomousCapability(),
    },
    code_ai_autonomous_status: {
      verify: async () => createCodeAIAutonomousStatusCapability(),
    },
    code_ai_commit: {
      execute: async () => createCodeAICommitCapability(),
    },
    code_ai_commit_status: {
      verify: async () => createCodeAICommitStatusCapability(),
    },
    secretary: {
      readAgenda: async () => createSecretaryCapability("readAgenda"),
      scanDueWork: async () => createSecretaryCapability("scanDueWork"),
      createCalendarEvent: async () => createSecretaryCapability("createCalendarEvent"),
      updateCalendarEvent: async () => createSecretaryCapability("updateCalendarEvent"),
      listContacts: async () => createSecretaryCapability("listContacts"),
      createContact: async () => createSecretaryCapability("createContact"),
      upsertContactProfile: async () => createSecretaryCapability("upsertContactProfile"),
      listTasks: async () => createSecretaryCapability("listTasks"),
      createTask: async () => createSecretaryCapability("createTask"),
      updateTask: async () => createSecretaryCapability("updateTask"),
      listFollowUps: async () => createSecretaryCapability("listFollowUps"),
      createFollowUp: async () => createSecretaryCapability("createFollowUp"),
      listCalls: async () => createSecretaryCapability("listCalls"),
      logCall: async () => createSecretaryCapability("logCall"),
      readSettings: async () => createSecretaryCapability("readSettings"),
      updateSettings: async () => createSecretaryCapability("updateSettings"),
    },
    secretary_correspondence: {
      inbox: async () => createSecretaryCorrespondenceCapability("inbox"),
      read: async () => createSecretaryCorrespondenceCapability("read"),
      open: async () => createSecretaryCorrespondenceCapability("open"),
      draft: async () => createSecretaryCorrespondenceCapability("draft"),
      sendDraft: async () => createSecretaryCorrespondenceCapability("sendDraft"),
      setStatus: async () => createSecretaryCorrespondenceCapability("setStatus"),
    },
    secretary_briefing: {
      read: async () => createSecretaryExecutiveBriefingCapability(),
    },
    secretary_job: {
      delegate: async () => createSecretaryJobCapability("delegate"),
      list: async () => createSecretaryJobCapability("list"),
      read: async () => createSecretaryJobCapability("read"),
      approve: async () => createSecretaryJobCapability("approve"),
      reject: async () => createSecretaryJobCapability("reject"),
      revise: async () => createSecretaryJobCapability("revise"),
      cancel: async () => createSecretaryJobCapability("cancel"),
    },
    secretary_meeting_preparation: {
      prepare: async () => createSecretaryMeetingPreparationCapability(),
    },
    secretary_paperwork: {
      coordinate: async () => createSecretaryPaperworkCapability(),
      status: async () => createSecretaryPaperworkStatusCapability(),
    },
    secretary_travel: {
      coordinate: async () => createSecretaryTravelCapability(),
    },
    secretary_outbound_call: {
      place: async () => createSecretaryOutboundCallCapability("place"),
      list: async () => createSecretaryOutboundCallCapability("list"),
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
