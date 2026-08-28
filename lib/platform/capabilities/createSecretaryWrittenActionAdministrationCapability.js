import {
  startSecretaryWrittenActionAdministration,
  reviseSecretaryWrittenActionAdministration,
  refreshSecretaryWrittenActionAdministration,
  recordSecretaryWrittenActionResponse,
  recordSecretaryWrittenActionOutcome,
  recordSecretaryWrittenActionFiling,
  cancelSecretaryWrittenActionAdministration,
  readSecretaryWrittenActionAdministration,
  listSecretaryWrittenActionAdministration,
} from "@/lib/operator/secretary/SecretaryWrittenActionAdministrationRuntime";

const ACTIONS = Object.freeze({
  start: startSecretaryWrittenActionAdministration,
  revise: reviseSecretaryWrittenActionAdministration,
  refresh: refreshSecretaryWrittenActionAdministration,
  recordResponse: recordSecretaryWrittenActionResponse,
  recordOutcome: recordSecretaryWrittenActionOutcome,
  recordFiling: recordSecretaryWrittenActionFiling,
  cancel: cancelSecretaryWrittenActionAdministration,
  read: readSecretaryWrittenActionAdministration,
  list: listSecretaryWrittenActionAdministration,
});

export function createSecretaryWrittenActionAdministrationCapability(action = "read") {
  const execute = ACTIONS[action];
  if (!execute) throw new Error(`SECRETARY_WRITTEN_ACTION_CAPABILITY_ACTION_INVALID:${action}`);
  return {
    id: `secretary_written_action_administration.${action}`,
    name: "Secretary Written Action Administration",
    description: "Administratively coordinate written resolutions, written consents, and circular actions using frozen filed-document references, explicit participant-response evidence, reported outcome evidence, and final filing evidence. This capability never determines quorum, legal validity/effect, statutory compliance, corporate authority, or creates a participant vote, consent, approval, or signature.",
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

export default createSecretaryWrittenActionAdministrationCapability;
