function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value : []; }

function normalizedObject(raw = {}, index = 0) {
  const source = object(raw);
  const evidence = object(source.evidence);
  const merged = Object.keys(evidence).length ? evidence : source;
  return {
    object_id: text(source.object_id || source.id, 120) || `object_${index + 1}`,
    evidence_span: object(source.evidence_span || source.source_span || source.location),
    evidence: merged,
  };
}

export function attachmentLogicalObjects(file = {}) {
  const analysis = object(file.analysis);
  if (analysis.status !== "ANALYZED") return [];
  const evidence = object(analysis.evidence);
  const explicit = list(analysis.objects).length ? list(analysis.objects) : list(evidence.objects);
  const objects = explicit.length
    ? explicit.slice(0, 20).map(normalizedObject)
    : [normalizedObject({ object_id: "object_1", evidence }, 0)];

  return objects.map((logical, index) => ({
    ...file,
    logical_object_id: logical.object_id || `object_${index + 1}`,
    evidence_span: logical.evidence_span,
    analysis: {
      ...analysis,
      evidence: logical.evidence,
      objects: undefined,
      candidate_domains: list(logical.evidence.candidate_domains || analysis.candidate_domains),
      confidence: Number(logical.evidence.confidence ?? analysis.confidence) || 0,
      clarification_required: logical.evidence.clarification_required === true,
      clarification_question: text(logical.evidence.clarification_question, 700) || null,
      authorization_effect: "NONE",
    },
    authorization_effect: "NONE",
  }));
}

export default attachmentLogicalObjects;
