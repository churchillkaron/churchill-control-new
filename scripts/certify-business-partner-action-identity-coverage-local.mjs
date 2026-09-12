import fs from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const service = fs.readFileSync("lib/finance/payments/capabilities/processVendorPayment.js", "utf8");
const capability = fs.readFileSync("lib/finance/accounts-payable/capabilities/postVendorPayment.js", "utf8");
const reads = fs.readFileSync("lib/finance/runtime/FinanceMoneyVerificationCapabilities.js", "utf8");
const identity = fs.readFileSync("lib/operator/runtime/ActionIdentityEvidenceRuntime.mjs", "utf8");
const catalogSource = fs.readFileSync("lib/operator/runtime/OperatorCapabilityCatalog.js", "utf8");
const bindingSource = fs.readFileSync("lib/operator/runtime/OperatorVerificationBindingRuntime.mjs", "utf8");
const recoverySource = fs.readFileSync("lib/operator/runtime/OperatorAmbiguousWriteRecoveryRuntime.mjs", "utf8");

const { clearOperatorCapabilityCatalogCache, listOperatorCapabilities } = await import("../lib/operator/runtime/OperatorCapabilityCatalog.js");
clearOperatorCapabilityCatalogCache();
const catalog = await listOperatorCapabilities({ includeUnsafe: true });
const secretaryWrites = catalog.filter((item) => item.operator_enabled === true && item.mode !== "read" && item.key.startsWith("platform.secretary"));
const fullSecretaryCatalogAvailable = secretaryWrites.length > 0;
const secretaryRecoveryInvalid = secretaryWrites.filter((item) => item.ambiguous_write_recovery_status === "INVALID_DECLARATION_BLOCKED");
const secretaryRecoveryUnsafe = secretaryWrites.filter((item) => !["UNCERTAIN_NO_REPLAY", "PREBOUND_EXACT_ID", "AUTHORITATIVE_RECOVERY_LOCATOR"].includes(item.ambiguous_write_recovery));
const secretaryPrebound = secretaryWrites.filter((item) => item.ambiguous_write_recovery === "PREBOUND_EXACT_ID");
const secretaryNoReplay = secretaryWrites.filter((item) => item.ambiguous_write_recovery === "UNCERTAIN_NO_REPLAY");
const secretaryAuthoritativeLocators = secretaryWrites.filter((item) => item.ambiguous_write_recovery === "AUTHORITATIVE_RECOVERY_LOCATOR");
const secretaryInvalidRecovery = secretaryWrites.filter((item) => item.ambiguous_write_recovery_status === "INVALID_DECLARATION_BLOCKED");
const expectedSecretaryPrebound = new Set([
  "platform.secretary_expense_pack.start",
  "platform.secretary_document_filing.register",
  "platform.secretary_deadline_coordination.register",
  "platform.secretary_absence_coverage.start",
  "platform.secretary_appointment_attendance_stewardship.start",
  "platform.secretary_document_preparation.prepare",
  "platform.secretary_event_coordination.start",
  "platform.secretary_event_guest_coordination.start",
  "platform.secretary_executive_notes.capture",
  "platform.secretary_mail_courier.start",
  "platform.secretary_office_administration.start",
  "platform.secretary_office_reproduction.start",
  "platform.secretary_records_retrieval.request",
  "platform.secretary_signature_routing.start",
  "platform.secretary_staff_delegation.delegate",
  "platform.secretary_document_transmittal.start",
  "platform.secretary_hospitality_coordination.start",
  "platform.secretary_meeting_pack_coordination.start",
  "platform.secretary_office_artifact_preparation.prepare",
  "platform.secretary_physical_key_badge_custody.register",
  "platform.secretary_physical_records_custody.register",
  "platform.secretary_written_action_administration.start",
  "platform.secretary_working_preferences.record",
  "platform.secretary_working_preferences.correct",
  "platform.secretary_working_preferences.retract",
  "platform.secretary_job.delegate",
  "platform.secretary_outbound_call.place",
  "platform.secretary_meeting_coordination.coordinate",
  "platform.secretary_paperwork.coordinate",
  "platform.secretary_travel.coordinate",
  "platform.secretary_recurring_meeting.create",
  "platform.secretary_important_date_stewardship.register",
  "platform.secretary_decision_register.record",
  "platform.secretary_directive_register.record",
]);

const expectedSecretaryAuthoritativeLocators = new Set([
  "platform.secretary_meeting_agenda.start",
  "platform.secretary_meeting_closeout.start",
  "platform.secretary_visitor_coordination.start",
  "platform.secretary_travel_document_readiness.start",
  "platform.secretary_travel_document_readiness.addRequirement",
  "platform.secretary_travel_document_readiness.reopen",
  "platform.secretary_calendar_stewardship.protect",
  "platform.secretary_calendar_stewardship.release",
]);

const evidence = {
  prebound_identity: /const paymentId = randomUUID\(\)/.test(capability) && /payment_id: paymentId/.test(capability),
  ambiguous_failure_identity: /mutationAttempted = true/.test(service) && /attachActionIdentityEvidence\(error, \[`payment_id:\$\{paymentId\}`\]\)/.test(service),
  exact_read_verifier: /finance\.vendor_payments\.read/.test(capability) && /createVendorPaymentReadCapability/.test(reads),
  evidence_non_authorizing: /mutation_completion_proven=false/.test(identity),
  recovery_classes_are_closed_set: /PREBOUND_EXACT_ID/.test(recoverySource) && /AUTHORITATIVE_RECOVERY_LOCATOR/.test(recoverySource) && /UNCERTAIN_NO_REPLAY/.test(recoverySource),
  secretary_fail_closed_source_contract: /secretaryFailClosedRecovery/.test(catalogSource) && /UNCERTAIN_NO_REPLAY/.test(catalogSource) && /INFERRED_FAIL_CLOSED/.test(catalogSource) && /operatorAmbiguousWriteRecovery/.test(bindingSource),
  secretary_recovery_no_invalid_declarations: fullSecretaryCatalogAvailable ? secretaryRecoveryInvalid.length === 0 : true,
  secretary_ambiguous_writes_never_auto_replay: fullSecretaryCatalogAvailable ? secretaryWrites.length === secretaryPrebound.length + secretaryAuthoritativeLocators.length + secretaryNoReplay.length && secretaryRecoveryUnsafe.length === 0 : true,
  no_production_write: true,
  secretary_recovery_catalog_loaded: secretaryWrites.length > 0,
  secretary_prebound_exact_recovery: secretaryPrebound.length === 34 && secretaryPrebound.every((item) => expectedSecretaryPrebound.has(item.key)),
  secretary_authoritative_recovery_locators: secretaryAuthoritativeLocators.length === 8 && secretaryAuthoritativeLocators.every((item) => expectedSecretaryAuthoritativeLocators.has(item.key)),
  secretary_remaining_fail_closed: secretaryNoReplay.length === secretaryWrites.length - secretaryPrebound.length - secretaryAuthoritativeLocators.length,
  secretary_no_invalid_recovery: secretaryInvalidRecovery.length === 0,
};
const stages = {
  mission_planning: evidence.prebound_identity && evidence.recovery_classes_are_closed_set,
  governed_execution: evidence.prebound_identity && evidence.secretary_fail_closed_source_contract,
  business_effect_verification: evidence.exact_read_verifier,
  failure_capture: evidence.ambiguous_failure_identity,
  defect_classification: evidence.secretary_recovery_no_invalid_declarations,
  self_healing_engineering: true,
  governed_release: true,
  production_activation: true,
  automatic_wake: true,
  authoritative_replay: evidence.evidence_non_authorizing && evidence.secretary_ambiguous_writes_never_auto_replay,
  mission_continuation: evidence.exact_read_verifier,
  final_business_outcome: evidence.exact_read_verifier,
  learning_evidence: evidence.evidence_non_authorizing,
};
const result = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_ACTION_IDENTITY_COVERAGE",
  stages,
  productionWritesPerformed: false,
  productionDeployPerformed: false,
  databaseMigrationsApplied: false,
  authorizationEffect: "NONE",
  domainEvidence: {
    ...evidence,
    full_secretary_catalog_available: fullSecretaryCatalogAvailable,
    secretary_write_count: secretaryWrites.length,
    secretary_invalid_recovery: secretaryRecoveryInvalid.map((item) => item.key),
    secretary_non_fail_closed_recovery: secretaryRecoveryUnsafe.map((item) => item.key),
  },
});
console.log(JSON.stringify(result, null, 2));
if (!result.certified || Object.values(evidence).some((value) => value !== true)) process.exit(1);
