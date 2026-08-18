import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function rejectMatch(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

const communicationService = read("lib/commercial/communications/CommunicationService.js");
const draftCapability = read("lib/commercial/communications/capabilities/draftMessage.js");
const serviceRuntime = read("lib/service-management/runtime/ServiceReportCommunicationDraftRuntime.js");
const serviceRoute = read("app/api/service-management/reports/[occurrenceId]/delivery-draft/communications/route.js");

requireMatch(
  communicationService,
  /expectedCustomerPartyId/,
  "Communications draft persistence must support an expected customer party guard.",
);
requireMatch(
  communicationService,
  /COMMUNICATION_CUSTOMER_CONTEXT_MISMATCH/,
  "Communications must reject drafts when the selected conversation belongs to another customer.",
);
requireMatch(
  communicationService,
  /status:\s*["']DRAFT["']/,
  "The generic Communications draft path must persist DRAFT status only.",
);
requireMatch(
  communicationService,
  /createAttachments\(/,
  "Communications drafts must persist canonical message attachments through the existing attachment repository.",
);
requireMatch(
  draftCapability,
  /customer_party_id/,
  "The generic draft capability must expose the customer guard input.",
);
requireMatch(
  draftCapability,
  /attachments/,
  "The generic draft capability must support attachments.",
);
requireMatch(
  draftCapability,
  /source_context/,
  "The generic draft capability must support source lineage without duplicating source documents.",
);
requireMatch(
  draftCapability,
  /This never queues or sends the message/,
  "The generic draft capability contract must remain draft-only.",
);
requireMatch(
  serviceRuntime,
  /executeCapability\(/,
  "Service Management must cross into Communications through the UBTE capability engine.",
);
requireMatch(
  serviceRuntime,
  /domain:\s*["']commercial["']/,
  "Service report delivery must target the Commercial domain through UBTE.",
);
requireMatch(
  serviceRuntime,
  /action:\s*["']draftMessage["']/,
  "Service report delivery may create only a Communications DRAFT in this slice.",
);
requireMatch(
  serviceRuntime,
  /customer_party_id:\s*customerPartyId/,
  "Service report delivery must bind the Communications draft to the report customer.",
);
requireMatch(
  serviceRuntime,
  /requires_explicit_confirmation:\s*true/,
  "The resulting customer message must still require explicit send confirmation.",
);
requireMatch(
  serviceRuntime,
  /auto_send:\s*false/,
  "Service report delivery must not auto-send.",
);
requireMatch(
  serviceRoute,
  /export async function POST/,
  "The Communications draft bridge must be an explicit mutation endpoint.",
);
requireMatch(
  serviceRoute,
  /resolveServiceManagementContext/,
  "The Service Management mutation endpoint must resolve organization access before invoking UBTE.",
);

rejectMatch(
  serviceRuntime,
  /draftOutboundMessage|deliverCommunicationMessage|queueOutboundMessage/,
  "Service Management must not call Communications repositories or delivery runtimes directly.",
);
rejectMatch(
  serviceRoute,
  /deliverCommunicationMessage|queueOutboundMessage|sendDraftMessage/,
  "The Service Management route must not send a customer message.",
);
rejectMatch(
  serviceRuntime + serviceRoute,
  /\.from\(|\.insert\(|\.update\(|\.delete\(/,
  "Service Management must not create a parallel delivery store.",
);

console.log("SERVICE_REPORT_COMMUNICATIONS_DRAFT_AUDIT_PASSED");
console.log("SERVICE_REPORT_COMMUNICATIONS_WRITE=CANONICAL_DRAFT_ONLY");
console.log("SERVICE_REPORT_COMMUNICATIONS_CUSTOMER_GUARD=ENFORCED");
console.log("SERVICE_REPORT_COMMUNICATIONS_ATTACHMENTS=CANONICAL");
console.log("SERVICE_REPORT_COMMUNICATIONS_SEND=EXPLICIT_CONFIRMATION_REQUIRED");
console.log("SERVICE_REPORT_COMMUNICATIONS_AUTO_SEND=FALSE");
