import {
  registerSecretaryAccessMediaCustody,
  issueSecretaryAccessMedia,
  initiateSecretaryAccessMediaTransfer,
  acknowledgeSecretaryAccessMediaTransfer,
  returnSecretaryAccessMediaToStorage,
  markSecretaryAccessMediaMissing,
  recoverSecretaryAccessMedia,
  refreshSecretaryAccessMediaCustody,
  cancelSecretaryAccessMediaCustody,
  readSecretaryAccessMediaCustody,
  listSecretaryAccessMediaCustody,
} from "@/lib/operator/secretary/SecretaryAccessMediaCustodyRuntime";

const ACTIONS = Object.freeze({
  register: registerSecretaryAccessMediaCustody,
  issue: issueSecretaryAccessMedia,
  initiateTransfer: initiateSecretaryAccessMediaTransfer,
  acknowledgeTransfer: acknowledgeSecretaryAccessMediaTransfer,
  returnToStorage: returnSecretaryAccessMediaToStorage,
  markMissing: markSecretaryAccessMediaMissing,
  recover: recoverSecretaryAccessMedia,
  refresh: refreshSecretaryAccessMediaCustody,
  cancel: cancelSecretaryAccessMediaCustody,
  read: readSecretaryAccessMediaCustody,
  list: listSecretaryAccessMediaCustody,
});

export function createSecretaryPhysicalKeyBadgeCustodyCapability(action = "read") {
  const execute = ACTIONS[action];
  if (!execute) throw new Error(`SECRETARY_PHYSICAL_KEY_BADGE_CUSTODY_ACTION_INVALID:${action}`);
  return {
    id: `secretary_physical_key_badge_custody.${action}`,
    name: "Secretary Physical Key and Badge Custody",
    description: "Tracks physical possession records for keys, cards, badges, fobs, tokens and similar office items: storage, issue, handoff acknowledgement, return, missing reports and recovery. It records custody evidence only and cannot change permissions, security-system settings, credential state, identity records or secret values.",
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

export default createSecretaryPhysicalKeyBadgeCustodyCapability;
