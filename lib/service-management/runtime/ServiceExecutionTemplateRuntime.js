import { createServiceExecutionTemplateDocument } from "../documents/ServiceExecutionTemplate";
import {
  insertServiceExecutionTemplate,
  listServiceExecutionTemplates,
} from "../repositories/ServiceExecutionTemplateRepository";

function requireContext(context = {}) {
  if (!context.organization_id) {
    const error = new Error("Service Management requires organization_id.");
    error.status = 400;
    throw error;
  }
  return context;
}

export async function getServiceExecutionTemplates({ context, filters = {} }) {
  const runtimeContext = requireContext(context);
  return listServiceExecutionTemplates({
    organizationId: runtimeContext.organization_id,
    entityId: filters.entity_id || filters.entityId || runtimeContext.entity_id || null,
    industryKey: filters.industry_key || filters.industryKey || null,
    status: filters.status === "all" ? null : (filters.status || "active"),
    limit: filters.limit,
  });
}

export async function createServiceExecutionTemplate({ context, input = {} }) {
  const runtimeContext = requireContext(context);
  const template = createServiceExecutionTemplateDocument(input);
  return insertServiceExecutionTemplate({
    organizationId: runtimeContext.organization_id,
    entityId: runtimeContext.entity_id || null,
    actorId: runtimeContext.actor_id || null,
    template,
  });
}

export default Object.freeze({
  getServiceExecutionTemplates,
  createServiceExecutionTemplate,
});
