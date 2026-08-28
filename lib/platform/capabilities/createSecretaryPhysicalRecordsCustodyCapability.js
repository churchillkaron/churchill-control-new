import {
  acknowledgeSecretaryPhysicalRecordTransfer,
  cancelSecretaryPhysicalRecordCustody,
  checkoutSecretaryPhysicalRecordCustody,
  initiateSecretaryPhysicalRecordTransfer,
  listSecretaryPhysicalRecordCustody,
  markSecretaryPhysicalRecordMissing,
  readSecretaryPhysicalRecordCustody,
  recoverSecretaryPhysicalRecord,
  refreshSecretaryPhysicalRecordCustody,
  registerSecretaryPhysicalRecordCustody,
  returnSecretaryPhysicalRecordToStorage,
} from "@/lib/operator/secretary/SecretaryPhysicalRecordsCustodyRuntime";

const MANIFEST = Object.freeze({
  key: "secretary_physical_records_custody",
  name: "Secretary Physical Records Custody",
  description: "Tracks evidence-backed custody of physical files, folders, binders and boxes: explicit storage location, checkout, transfer acknowledgement, return, missing exceptions and recovery. It never reads record contents, grants physical access, bypasses permissions, destroys records, makes retention/legal-hold decisions, or infers custody/missing status from silence or overdue timing.",
  aiEnabled: false,
  operatorEnabled: true,
  operatorAutoExecute: true,
  operatorRequiresConfirmation: false,
  context: "organization",
  risk: "low",
  approvalRequired: false,
});

const ACTIONS = Object.freeze({
  register: registerSecretaryPhysicalRecordCustody,
  checkout: checkoutSecretaryPhysicalRecordCustody,
  initiateTransfer: initiateSecretaryPhysicalRecordTransfer,
  acknowledgeTransfer: acknowledgeSecretaryPhysicalRecordTransfer,
  returnToStorage: returnSecretaryPhysicalRecordToStorage,
  markMissing: markSecretaryPhysicalRecordMissing,
  recover: recoverSecretaryPhysicalRecord,
  refresh: refreshSecretaryPhysicalRecordCustody,
  cancel: cancelSecretaryPhysicalRecordCustody,
  read: readSecretaryPhysicalRecordCustody,
  list: listSecretaryPhysicalRecordCustody,
});

export function createSecretaryPhysicalRecordsCustodyCapability(action = "read") {
  const key = String(action || "read").trim();
  const run = ACTIONS[key];
  if (!run) throw new Error(`SECRETARY_PHYSICAL_RECORDS_ACTION_UNSUPPORTED:${key}`);
  return { manifest: MANIFEST, run };
}

export default createSecretaryPhysicalRecordsCustodyCapability;
