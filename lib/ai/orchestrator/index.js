
import { buildCEOView } from '@/lib/ai/ceo/ceoDashboardEngine';

import { routeAIModel } from "../routeAIModel";


/**
 * AI ORCHESTRATOR + BILLING INTEGRATION
 */

export async function aiOrchestrator({
  feature,
  organization,
  input,
  context = {},
}) {
// =========================
// MODULE-BASED ACCESS CONTROL (REPLACED)
// =========================


  const modules = runtime?.modules || [];

  const hasAccess = (feature) => {
    if (feature === 'ai_reasoning') {
      return modules.some(m =>
        m.module_id === 'owner_ai' ||
        m.module_id === 'analytics'
      );
    }
    return true;

  const aiCheck = { allowed: hasAccess('ai_reasoning') };

  if (!aiCheck.allowed) {
    return {
      success: false,
      error: 'MODULE_NOT_ENABLED'
  }
;
}

  

  const route = routeAIModel(input);

  const model =
    route.model === "deep"
      ? "gpt-4o"
      : "gpt-4o-mini";


  // =========================
  // LOG USAGE (CRITICAL)
  // =========================

  return {
    success: true,
    model,
    feature,
    route,
}
