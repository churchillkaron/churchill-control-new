import SecretaryDocumentTransmittalRuntime from "@/lib/operator/secretary/SecretaryDocumentTransmittalRuntime";

const ACTIONS = new Set([
  "start",
  "revise",
  "recordDistribution",
  "acknowledge",
  "refresh",
  "complete",
  "cancel",
  "read",
  "list",
]);

export function createSecretaryDocumentTransmittalCapability(action) {
  if (!ACTIONS.has(action)) throw new Error(`SECRETARY_DOCUMENT_TRANSMITTAL_ACTION_INVALID:${action}`);
  return {
    manifest: {
      id: `secretary_document_transmittal.${action}`,
      domain: "platform",
      capability: "secretary_document_transmittal",
      action,
      aiEnabled: false,
      operatorEnabled: true,
      operatorAutoExecute: true,
      operatorRequiresConfirmation: false,
      reversible: action !== "recordDistribution" && action !== "acknowledge",
      risk: "low",
      context: "organization",
      description: "Track frozen filed-document versions through evidence-backed distribution and receipt acknowledgement. This runtime is reference-only: it does not send or externally deliver documents, and acknowledgement never means approval, acceptance, signature, legal service, or legal effect.",
      requiresApproval: false,
    },
    authorize({ context } = {}) {
      if (!context?.organizationId) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
      return true;
    },
    async execute({ context, payload = {} } = {}) {
      const fn = SecretaryDocumentTransmittalRuntime[action];
      if (typeof fn !== "function") throw new Error(`SECRETARY_DOCUMENT_TRANSMITTAL_ACTION_UNAVAILABLE:${action}`);
      return fn({ context, payload });
    },
  };
}

export default createSecretaryDocumentTransmittalCapability;
