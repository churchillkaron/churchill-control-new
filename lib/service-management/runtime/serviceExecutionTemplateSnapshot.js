function cloneJson(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return JSON.parse(JSON.stringify(value));
}

export function createServiceExecutionTemplateSnapshot(template) {
  if (!template?.id) return null;

  return Object.freeze({
    schema_version: 1,
    template_id: template.id,
    version: Number(template.version) || 1,
    code: template.code || null,
    name: template.name || null,
    description: template.description || null,
    industry_key: template.industry_key || null,
    field_schema: cloneJson(template.field_schema, []),
    evidence_requirements: cloneJson(template.evidence_requirements, []),
    completion_rules: cloneJson(template.completion_rules, {}),
    instructions: template.instructions || null,
  });
}

export default createServiceExecutionTemplateSnapshot;
