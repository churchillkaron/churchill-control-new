/**
 * UBTE SAFETY LAYER
 * Prevents unsafe or incomplete execution
 */

export function validateUBTE(params) {
  if (!params) throw new Error("UBTE: missing params");

  if (!params.tenant_id) {
    throw new Error("UBTE: missing tenant_id");
  }

  if (!params.action) {
    throw new Error("UBTE: missing action");
  }

  if (!params.db) {
    throw new Error("UBTE: missing db function");
  }

  return true;
}
