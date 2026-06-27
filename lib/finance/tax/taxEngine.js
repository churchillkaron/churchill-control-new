/**
 * SINGLE TAX ENTRY ADAPTER (DO NOT DUPLICATE LOGIC HERE)
 * Uses DB-driven tax rules ONLY
 */

import { calculateTax as dbCalculateTax } from "../reporting/calculateTax";

export async function calculateTax(input) {
  return await dbCalculateTax(input);
}
