import { createProofOfServiceReport } from "../documents/ProofOfServiceReport";
import { getCompletedServiceOccurrence } from "../repositories/ServiceProofOfServiceRepository";

function requireContext(context = {}) {
  if (!context.organization_id) {
    const error = new Error("Proof of service requires organization_id.");
    error.status = 400;
    throw error;
  }
  return context;
}

export async function getProofOfServiceReport({ context, occurrenceId }) {
  const runtimeContext = requireContext(context);
  const occurrence = await getCompletedServiceOccurrence({
    organizationId: runtimeContext.organization_id,
    occurrenceId,
  });

  if (!occurrence) {
    const error = new Error("Completed service occurrence not found.");
    error.status = 404;
    throw error;
  }

  if (
    runtimeContext.entity_id
    && occurrence.entity_id
    && runtimeContext.entity_id !== occurrence.entity_id
  ) {
    const error = new Error("Completed service occurrence is outside the active entity scope.");
    error.status = 404;
    throw error;
  }

  return createProofOfServiceReport(occurrence);
}

export default Object.freeze({
  getProofOfServiceReport,
});
