import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { readSecretaryPaperworkStatus } from "@/lib/operator/secretary/SecretaryPaperworkStatusRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export function createSecretaryPaperworkStatusCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_paperwork",
    action: "status",
    name: "Executive Secretary paperwork status",
    document: "secretary_job",
    description:
      "Read one Secretary-owned paperwork job as a control view: missing/unverified documents, evidence-backed receipt and review state, Secretary handling, operational blocks and exact-step executive approvals required.",
    permissions: [],
    events: ["platform.secretary_paperwork.status"],
    tags: ["platform", "secretary", "executive-secretary", "paperwork", "documents", "evidence", "control", "read"],
    operatorAliases: [
      "show paperwork status",
      "what paperwork is missing",
      "what documents are still missing",
      "show this paperwork job",
      "what paperwork needs my approval",
      "secretary paperwork status",
    ],
    operatorExamples: [
      "show paperwork status",
      "what documents are still missing",
      "what paperwork needs my approval",
    ],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    approval: { required: false },
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
      },
      required: ["job_id"],
      additionalProperties: false,
    },
  });

  function authorize({ context }) {
    return Boolean(
      text(context?.organizationId) &&
      text(context?.metadata?.partyId || context?.actor?.partyId || context?.actor?.party_id),
    );
  }

  async function execute({ context, payload = {} }) {
    return readSecretaryPaperworkStatus({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createSecretaryPaperworkStatusCapability;
