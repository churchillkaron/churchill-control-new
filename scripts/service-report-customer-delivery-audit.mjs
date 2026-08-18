import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const requireMatch = (source, pattern, message) => {
  if (!pattern.test(source)) throw new Error(message);
};

const prepareRuntime = read("lib/service-management/runtime/ServiceReportDeliveryDraftRuntime.js");
const orchestrationRuntime = read("lib/service-management/runtime/ServiceReportCommunicationDraftRuntime.js");
const draftService = read("lib/commercial/communications/CommunicationService.js");
const draftCapability = read("lib/commercial/communications/capabilities/draftMessage.js");
const sendCapability = read("lib/commercial/communications/capabilities/sendDraftMessage.js");
const sendRoute = read("app/api/commercial/communications/conversations/[conversationId]/drafts/[messageId]/send/route.js");
const servicePage = read("app/(system)/workspace/[organizationId]/operations/field-service/service-reports/page.jsx");
const communicationsPage = read("app/(system)/workspace/[organizationId]/commercial/customers/communications/page.jsx");
const reviewBanner = read("components/workspace/commercial/CommunicationDraftReviewBanner.jsx");
const fieldServicePage = read("app/(system)/workspace/[organizationId]/operations/field-service/page.jsx");

requireMatch(prepareRuntime, /getCompletedServiceReport/, "Delivery preparation must derive from the canonical completed-service report.");
requireMatch(prepareRuntime, /owner_domain:\s*["']commercial\.communications["']/, "Commercial Communications must own delivery.");
requireMatch(prepareRuntime, /requires_explicit_send_confirmation:\s*true/, "Prepared delivery must require explicit send confirmation.");
requireMatch(prepareRuntime, /auto_send:\s*false/, "Prepared delivery must never auto-send.");
if (/billing\.(amount|currency|invoice)|movement_id/.test(prepareRuntime)) {
  throw new Error("Customer delivery preparation must not expose billing internals or Inventory movement identifiers.");
}

requireMatch(orchestrationRuntime, /executeCapability/, "Service Management must cross domains through UBTE.");
requireMatch(orchestrationRuntime, /domain:\s*["']commercial["']/, "Service report DRAFT must target Commercial.");
requireMatch(orchestrationRuntime, /action:\s*["']draftMessage["']/, "Service report persistence must use the canonical Communications draft capability.");
if (/\.from\(|createMessage|deliverCommunicationMessage|queueOutboundMessage/.test(orchestrationRuntime)) {
  throw new Error("Service Management must not own Communications persistence or delivery.");
}

requireMatch(draftService, /expectedCustomerPartyId/, "Communications DRAFT must enforce expected customer context.");
requireMatch(draftService, /COMMUNICATION_CUSTOMER_CONTEXT_MISMATCH/, "Cross-customer DRAFT writes must be rejected.");
requireMatch(draftService, /createAttachments/, "Communications must own DRAFT attachment persistence.");
requireMatch(draftService, /status:\s*["']DRAFT["']/, "Prepared messages must persist as DRAFT.");
requireMatch(draftCapability, /attachment_count/, "Canonical draft capability must expose attachment persistence result.");

requireMatch(sendCapability, /action:\s*["']sendDraftMessage["']/, "Canonical saved-draft send capability must remain present.");
requireMatch(sendCapability, /operatorRequiresConfirmation:\s*true/, "Canonical send capability must require confirmation.");
requireMatch(sendCapability, /risk:\s*["']high["']/, "Canonical send capability must remain high risk.");
requireMatch(sendRoute, /body\?\.confirmed\s*!==\s*true/, "Commercial send route must reject unconfirmed requests.");
requireMatch(sendRoute, /action:\s*["']sendDraftMessage["']/, "Commercial send route must invoke the canonical sendDraftMessage capability.");

requireMatch(servicePage, /customer_party_id/, "Service Reports must filter conversations by canonical customer party id.");
requireMatch(servicePage, /Create Communications DRAFT/, "Service Reports must create a DRAFT, not send directly.");
requireMatch(servicePage, /Open in Communications to review & send/, "Service Reports must hand confirmed sending to Communications.");
if (/drafts\/.*\/send|confirmed:\s*true/.test(servicePage)) {
  throw new Error("Service Reports UI must not send customer messages.");
}

requireMatch(communicationsPage, /CommunicationDraftReviewBanner/, "Canonical Communications page must host saved-draft review.");
requireMatch(reviewBanner, /Confirm send/, "Communications must expose a second explicit send confirmation.");
requireMatch(reviewBanner, /confirmed:\s*true/, "Only the confirmed Communications action may request send.");
requireMatch(fieldServicePage, /operations\/field-service\/service-reports/, "Field Service must register the Service Reports work center.");

console.log("SERVICE_REPORT_CUSTOMER_DELIVERY_AUDIT_PASSED");
console.log("SERVICE_REPORT_SOURCE=CANONICAL_COMPLETED_SERVICE_REPORT");
console.log("SERVICE_REPORT_DRAFT_OWNER=COMMERCIAL_COMMUNICATIONS");
console.log("SERVICE_REPORT_SEND_OWNER=COMMERCIAL_COMMUNICATIONS");
console.log("SERVICE_REPORT_CUSTOMER_GUARD=ENFORCED");
console.log("SERVICE_REPORT_SEND_CONFIRMATION=REQUIRED");
console.log("SERVICE_REPORT_AUTO_SEND=FALSE");
