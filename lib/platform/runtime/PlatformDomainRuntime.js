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
import { createSecretaryAbsenceCoverageCapability } from "@/lib/platform/capabilities/createSecretaryAbsenceCoverageCapability";
import { createSecretaryCallScreeningCapability } from "@/lib/platform/capabilities/createSecretaryCallScreeningCapability";
import { createSecretaryCommitmentControlCapability } from "@/lib/platform/capabilities/createSecretaryCommitmentControlCapability";
import { createSecretaryCorrespondenceCapability } from "@/lib/platform/capabilities/createSecretaryCorrespondenceCapability";
import { createSecretaryDeadlineCoordinationCapability } from "@/lib/platform/capabilities/createSecretaryDeadlineCoordinationCapability";
import { createSecretaryDocumentFilingCapability } from "@/lib/platform/capabilities/createSecretaryDocumentFilingCapability";
import { createSecretaryExecutiveBriefingCapability } from "@/lib/platform/capabilities/createSecretaryExecutiveBriefingCapability";
import { createSecretaryExpensePackCapability } from "@/lib/platform/capabilities/createSecretaryExpensePackCapability";
import { createSecretaryInboxTriageCapability } from "@/lib/platform/capabilities/createSecretaryInboxTriageCapability";
import { createSecretaryJobCapability } from "@/lib/platform/capabilities/createSecretaryJobCapability";
import { createSecretaryMeetingAgendaCapability } from "@/lib/platform/capabilities/createSecretaryMeetingAgendaCapability";
import { createSecretaryMeetingCloseoutCapability } from "@/lib/platform/capabilities/createSecretaryMeetingCloseoutCapability";
import { createSecretaryMeetingCoordinationCapability } from "@/lib/platform/capabilities/createSecretaryMeetingCoordinationCapability";
import { createSecretaryMeetingPreparationCapability } from "@/lib/platform/capabilities/createSecretaryMeetingPreparationCapability";
import { createSecretaryOutboundCallCapability } from "@/lib/platform/capabilities/createSecretaryOutboundCallCapability";
import { createSecretaryPaperworkCapability } from "@/lib/platform/capabilities/createSecretaryPaperworkCapability";
import { createSecretaryPaperworkStatusCapability } from "@/lib/platform/capabilities/createSecretaryPaperworkStatusCapability";
import { createSecretaryRecurringMeetingCapability } from "@/lib/platform/capabilities/createSecretaryRecurringMeetingCapability";
import { createSecretaryRelationshipMemoryCapability } from "@/lib/platform/capabilities/createSecretaryRelationshipMemoryCapability";
import { createSecretaryStaffDelegationCapability } from "@/lib/platform/capabilities/createSecretaryStaffDelegationCapability";
import { createSecretaryTravelCapability } from "@/lib/platform/capabilities/createSecretaryTravelCapability";
import { createSecretaryTravelOperationsCapability } from "@/lib/platform/capabilities/createSecretaryTravelOperationsCapability";
import { createSecretaryVisitorCoordinationCapability } from "@/lib/platform/capabilities/createSecretaryVisitorCoordinationCapability";
import { createSecretaryWorkingPreferencesCapability } from "@/lib/platform/capabilities/createSecretaryWorkingPreferencesCapability";

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
    secretary_inbox_triage: {
      read: async () => createSecretaryInboxTriageCapability(),
    },
    secretary_briefing: {
      read: async () => createSecretaryExecutiveBriefingCapability(),
    },
    secretary_commitments: {
      read: async () => createSecretaryCommitmentControlCapability(),
    },
    secretary_working_preferences: {
      read: async () => createSecretaryWorkingPreferencesCapability("read"),
      record: async () => createSecretaryWorkingPreferencesCapability("record"),
      correct: async () => createSecretaryWorkingPreferencesCapability("correct"),
      retract: async () => createSecretaryWorkingPreferencesCapability("retract"),
    },
    secretary_staff_delegation: {
      delegate: async () => createSecretaryStaffDelegationCapability("delegate"),
      read: async () => createSecretaryStaffDelegationCapability("read"),
      list: async () => createSecretaryStaffDelegationCapability("list"),
      recordResponse: async () => createSecretaryStaffDelegationCapability("recordResponse"),
      recordProgress: async () => createSecretaryStaffDelegationCapability("recordProgress"),
      reassign: async () => createSecretaryStaffDelegationCapability("reassign"),
      complete: async () => createSecretaryStaffDelegationCapability("complete"),
      refresh: async () => createSecretaryStaffDelegationCapability("refresh"),
      cancel: async () => createSecretaryStaffDelegationCapability("cancel"),
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
    secretary_meeting_coordination: {
      coordinate: async () => createSecretaryMeetingCoordinationCapability("coordinate"),
      status: async () => createSecretaryMeetingCoordinationCapability("status"),
      cancel: async () => createSecretaryMeetingCoordinationCapability("cancel"),
      rescheduleBooked: async () => createSecretaryMeetingCoordinationCapability("rescheduleBooked"),
      cancelBooked: async () => createSecretaryMeetingCoordinationCapability("cancelBooked"),
    },
    secretary_recurring_meeting: {
      create: async () => createSecretaryRecurringMeetingCapability("create"),
      read: async () => createSecretaryRecurringMeetingCapability("read"),
      moveOccurrence: async () => createSecretaryRecurringMeetingCapability("moveOccurrence"),
      skipOccurrence: async () => createSecretaryRecurringMeetingCapability("skipOccurrence"),
      cancelFuture: async () => createSecretaryRecurringMeetingCapability("cancelFuture"),
    },
    secretary_meeting_agenda: {
      start: async () => createSecretaryMeetingAgendaCapability("start"),
      read: async () => createSecretaryMeetingAgendaCapability("read"),
      addItem: async () => createSecretaryMeetingAgendaCapability("addItem"),
      recordContribution: async () => createSecretaryMeetingAgendaCapability("recordContribution"),
      finalize: async () => createSecretaryMeetingAgendaCapability("finalize"),
      revise: async () => createSecretaryMeetingAgendaCapability("revise"),
      distribute: async () => createSecretaryMeetingAgendaCapability("distribute"),
      acknowledge: async () => createSecretaryMeetingAgendaCapability("acknowledge"),
    },
    secretary_meeting_closeout: {
      start: async () => createSecretaryMeetingCloseoutCapability("start"),
      read: async () => createSecretaryMeetingCloseoutCapability("read"),
      recordResponse: async () => createSecretaryMeetingCloseoutCapability("recordResponse"),
      refresh: async () => createSecretaryMeetingCloseoutCapability("refresh"),
      cancel: async () => createSecretaryMeetingCloseoutCapability("cancel"),
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
    secretary_travel_operations: {
      read: async () => createSecretaryTravelOperationsCapability("read"),
      recordConfirmation: async () => createSecretaryTravelOperationsCapability("recordConfirmation"),
      correctConfirmation: async () => createSecretaryTravelOperationsCapability("correctConfirmation"),
      recordDisruption: async () => createSecretaryTravelOperationsCapability("recordDisruption"),
      createReminder: async () => createSecretaryTravelOperationsCapability("createReminder"),
    },
    secretary_visitor_coordination: {
      start: async () => createSecretaryVisitorCoordinationCapability("start"),
      read: async () => createSecretaryVisitorCoordinationCapability("read"),
      recordHostResponse: async () => createSecretaryVisitorCoordinationCapability("recordHostResponse"),
      recordVisitorResponse: async () => createSecretaryVisitorCoordinationCapability("recordVisitorResponse"),
      recordAccessDecision: async () => createSecretaryVisitorCoordinationCapability("recordAccessDecision"),
      refresh: async () => createSecretaryVisitorCoordinationCapability("refresh"),
      acknowledge: async () => createSecretaryVisitorCoordinationCapability("acknowledge"),
      recordArrival: async () => createSecretaryVisitorCoordinationCapability("recordArrival"),
      cancel: async () => createSecretaryVisitorCoordinationCapability("cancel"),
    },
    secretary_expense_pack: {
      start: async () => createSecretaryExpensePackCapability("start"),
      read: async () => createSecretaryExpensePackCapability("read"),
      addExpectedItem: async () => createSecretaryExpensePackCapability("addExpectedItem"),
      recordReceipt: async () => createSecretaryExpensePackCapability("recordReceipt"),
      recordUnavailable: async () => createSecretaryExpensePackCapability("recordUnavailable"),
      finalize: async () => createSecretaryExpensePackCapability("finalize"),
      revise: async () => createSecretaryExpensePackCapability("revise"),
      queueReview: async () => createSecretaryExpensePackCapability("queueReview"),
      acknowledgeReview: async () => createSecretaryExpensePackCapability("acknowledgeReview"),
      cancel: async () => createSecretaryExpensePackCapability("cancel"),
    },
    secretary_document_filing: {
      register: async () => createSecretaryDocumentFilingCapability("register"),
      fileVersion: async () => createSecretaryDocumentFilingCapability("fileVersion"),
      recordUnavailable: async () => createSecretaryDocumentFilingCapability("recordUnavailable"),
      reclassify: async () => createSecretaryDocumentFilingCapability("reclassify"),
      reconcileCurrentName: async () => createSecretaryDocumentFilingCapability("reconcileCurrentName"),
      read: async () => createSecretaryDocumentFilingCapability("read"),
      list: async () => createSecretaryDocumentFilingCapability("list"),
      cancel: async () => createSecretaryDocumentFilingCapability("cancel"),
    },
    secretary_relationship_memory: {
      read: async () => createSecretaryRelationshipMemoryCapability("read"),
      recordFact: async () => createSecretaryRelationshipMemoryCapability("recordFact"),
      correctFact: async () => createSecretaryRelationshipMemoryCapability("correctFact"),
      retractFact: async () => createSecretaryRelationshipMemoryCapability("retractFact"),
      recordInteraction: async () => createSecretaryRelationshipMemoryCapability("recordInteraction"),
      setNextTouch: async () => createSecretaryRelationshipMemoryCapability("setNextTouch"),
      clearNextTouch: async () => createSecretaryRelationshipMemoryCapability("clearNextTouch"),
      listAttention: async () => createSecretaryRelationshipMemoryCapability("listAttention"),
    },
    secretary_deadline_coordination: {
      register: async () => createSecretaryDeadlineCoordinationCapability("register"),
      read: async () => createSecretaryDeadlineCoordinationCapability("read"),
      list: async () => createSecretaryDeadlineCoordinationCapability("list"),
      recordInput: async () => createSecretaryDeadlineCoordinationCapability("recordInput"),
      revise: async () => createSecretaryDeadlineCoordinationCapability("revise"),
      recordCompletion: async () => createSecretaryDeadlineCoordinationCapability("recordCompletion"),
      refresh: async () => createSecretaryDeadlineCoordinationCapability("refresh"),
      cancel: async () => createSecretaryDeadlineCoordinationCapability("cancel"),
    },
    secretary_absence_coverage: {
      start: async () => createSecretaryAbsenceCoverageCapability("start"),
      read: async () => createSecretaryAbsenceCoverageCapability("read"),
      list: async () => createSecretaryAbsenceCoverageCapability("list"),
      acknowledgeHandoff: async () => createSecretaryAbsenceCoverageCapability("acknowledgeHandoff"),
      revise: async () => createSecretaryAbsenceCoverageCapability("revise"),
      refresh: async () => createSecretaryAbsenceCoverageCapability("refresh"),
      endEarly: async () => createSecretaryAbsenceCoverageCapability("endEarly"),
      cancel: async () => createSecretaryAbsenceCoverageCapability("cancel"),
    },
    secretary_call_screening: {
      setContactHandling: async () => createSecretaryCallScreeningCapability("setContactHandling"),
      clearContactHandling: async () => createSecretaryCallScreeningCapability("clearContactHandling"),
      readContactHandling: async () => createSecretaryCallScreeningCapability("readContactHandling"),
      screen: async () => createSecretaryCallScreeningCapability("screen"),
      read: async () => createSecretaryCallScreeningCapability("read"),
      listAttention: async () => createSecretaryCallScreeningCapability("listAttention"),
      recordDisposition: async () => createSecretaryCallScreeningCapability("recordDisposition"),
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
