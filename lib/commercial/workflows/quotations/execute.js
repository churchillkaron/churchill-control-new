import { authorizeCreateQuotation } from "@/lib/commercial/capabilities/CreateQuotation/authorize";
import { createQuotationDto } from "@/lib/commercial/capabilities/CreateQuotation/dto";
import { validateCreateQuotation } from "@/lib/commercial/capabilities/CreateQuotation/validate";
import { createQuotation } from "@/lib/commercial/quotations/QuotationService";

export async function executeCreateQuotation({ access, body, organizationId, request }) {
  authorizeCreateQuotation({ access });
  const input = createQuotationDto({ ...body, organizationId });
  const validation = validateCreateQuotation(input);

  if (!validation.valid) {
    const error = new Error(validation.errors.join("; "));
    error.status = 400;
    throw error;
  }

  return createQuotation({ access, body: input, organizationId, request });
}
