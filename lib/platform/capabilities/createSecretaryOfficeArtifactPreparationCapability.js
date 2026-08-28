import {
  prepareSecretaryOfficeArtifact,
  reviseSecretaryOfficeArtifact,
  renderSecretaryOfficeArtifact,
  cancelSecretaryOfficeArtifact,
  readSecretaryOfficeArtifact,
  listSecretaryOfficeArtifacts,
} from "@/lib/operator/secretary/SecretaryOfficeArtifactPreparationRuntime";

const ACTIONS = Object.freeze({
  prepare: prepareSecretaryOfficeArtifact,
  revise: reviseSecretaryOfficeArtifact,
  render: renderSecretaryOfficeArtifact,
  cancel: cancelSecretaryOfficeArtifact,
  read: readSecretaryOfficeArtifact,
  list: listSecretaryOfficeArtifacts,
});

export function createSecretaryOfficeArtifactPreparationCapability(action = "read") {
  const execute = ACTIONS[action];
  if (!execute) throw new Error(`SECRETARY_OFFICE_ARTIFACT_CAPABILITY_ACTION_INVALID:${action}`);
  return {
    id: `secretary_office_artifact_preparation.${action}`,
    name: "Secretary Office Artifact Preparation",
    description: "Prepare and render internal office artifacts from frozen explicit sources. Documents can render as PDF, DOCX, or PPTX; spreadsheets render as XLSX with data-only cells. This capability does not publish, file, send, sign, post accounting entries, infer approval, persist artifact bytes externally, or change permissions.",
    manifest: {
      aiEnabled: false,
      operatorEnabled: true,
      operatorAutoExecute: true,
      operatorRequiresConfirmation: false,
      contextScope: "organization",
      risk: "low",
      reversible: true,
      approvalRequired: false,
      inputSchema: { type: "object" },
    },
    authorize({ context } = {}) {
      if (!context?.organizationId) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
      return true;
    },
    async execute({ context, payload = {} } = {}) {
      return execute({ context, payload });
    },
  };
}

export default createSecretaryOfficeArtifactPreparationCapability;
