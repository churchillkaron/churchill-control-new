function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function parseStructuredText(value) {
  const source = text(value);
  if (!source) return null;
  const cleaned = source
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try { return JSON.parse(cleaned.slice(first, last + 1)); } catch { return null; }
    }
    return null;
  }
}

export function unwrapWebsiteOutput(value = {}) {
  let current = value;
  const seen = new Set();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const next = current.output || current.result || current.data || null;
    if (!next || next === current) break;
    current = next;
  }
  if (typeof current === "string") {
    return parseStructuredText(current) || { text: current };
  }
  if (current && typeof current === "object") {
    const structured = parseStructuredText(current.text || current.content || current.output_text);
    if (structured) return structured;
  }
  return current || {};
}

function sectionsFrom(value = {}) {
  const candidates = [value.sections, value.pages?.[0]?.sections, value.content?.sections];
  const sections = candidates.find(Array.isArray) || [];
  return sections.map((section, index) => ({
    id: text(section.id || section.slug || `section-${index + 1}`),
    type: text(section.type || section.kind || "content").toLowerCase(),
    eyebrow: text(section.eyebrow || section.kicker),
    title: text(section.title || section.heading),
    body: text(section.body || section.copy || section.description),
    items: list(section.items || section.cards || section.features),
    cta: object(section.cta || section.action),
    media: object(section.media || section.image),
    metadata: object(section.metadata),
  }));
}

export function resolveWebsiteContract(task = {}, dependencies = []) {
  const outputs = dependencies.map((item) => unwrapWebsiteOutput(item.output));
  const architecture = outputs.find((item) => item.routes || item.pages || item.information_architecture) || {};
  const content = outputs.find((item) => item.sections || item.content || item.copy || item.pages) || outputs.at(-1) || {};
  const spec = {
    ...object(task.input?.requirements?.output_spec),
    ...object(task.input?.output_spec),
    ...object(task.metadata?.output_spec),
  };
  const sections = sectionsFrom(content);
  if (!sections.length) throw new Error("CREATIVE_WEBSITE_SECTIONS_REQUIRED");
  const title = text(content.title || content.site_title || architecture.title || spec.title);
  if (!title) throw new Error("CREATIVE_WEBSITE_TITLE_REQUIRED");
  return {
    title,
    description: text(content.description || content.meta_description || architecture.description || spec.description),
    language: text(spec.language || content.language || "en"),
    sections,
    navigation: list(content.navigation || architecture.navigation || sections.map((section) => ({ label: section.title, href: `#${section.id}` }))),
    theme: {
      background: text(spec.theme?.background || content.theme?.background || "#090909"),
      surface: text(spec.theme?.surface || content.theme?.surface || "#141414"),
      foreground: text(spec.theme?.foreground || content.theme?.foreground || "#f7f3ec"),
      muted: text(spec.theme?.muted || content.theme?.muted || "#aaa39a"),
      accent: text(spec.theme?.accent || content.theme?.accent || "#d6a66a"),
      font_family: text(spec.theme?.font_family || content.theme?.font_family || "Inter, Arial, sans-serif"),
    },
    requirements: {
      responsive: spec.responsive !== false,
      accessibility: spec.accessibility !== false,
      deployment_target: text(spec.deployment_target || spec.deploymentTarget),
      analytics_required: spec.analytics_required === true || spec.analyticsRequired === true,
      forms: list(spec.forms || content.forms),
    },
  };
}

export function websiteQualityPass(value = {}) {
  const evidence = unwrapWebsiteOutput(value);
  if (evidence.passed === true || evidence.approved === true || evidence.release_readiness === true) return true;
  const verdict = text(evidence.verdict || evidence.status || evidence.decision).toUpperCase();
  return ["PASS", "PASSED", "APPROVED", "READY", "RELEASE_READY"].includes(verdict);
}

export function websiteQualityFailures(value = {}) {
  const evidence = unwrapWebsiteOutput(value);
  return [
    ...list(evidence.failed_checks),
    ...list(evidence.failures),
    ...list(evidence.critical_failures),
    ...list(evidence.issues).map((item) => typeof item === "string" ? item : item?.message || item?.issue),
  ].filter(Boolean).map(String);
}
