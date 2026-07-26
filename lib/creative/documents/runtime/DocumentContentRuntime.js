function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

export function unwrapDocumentOutput(value) {
  let current = value;
  const seen = new Set();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const next = current.output || current.result || current.json || current.data || null;
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

function paragraphText(value) {
  if (typeof value === "string" || typeof value === "number") return text(value);
  if (Array.isArray(value)) return value.map(paragraphText).filter(Boolean).join("\n");
  const source = object(value);
  return text(
    source.text || source.body || source.content || source.description ||
    source.copy || source.value || source.summary || source.message,
  );
}

export function dependencyDocumentContent(task, tasks = []) {
  const dependencies = new Set(list(task.depends_on));
  const candidates = tasks
    .filter((candidate) => dependencies.has(candidate.id))
    .sort((left, right) => Date.parse(right.updated_at || 0) - Date.parse(left.updated_at || 0));
  for (const candidate of candidates) {
    const values = [
      candidate.output?.output,
      candidate.output?.provider_submission?.output,
      candidate.output?.result,
      candidate.output,
    ];
    for (const value of values) {
      const resolved = unwrapDocumentOutput(value);
      if (resolved && (typeof resolved === "string" || Object.keys(object(resolved)).length)) {
        return resolved;
      }
    }
  }
  return null;
}

export function normalizeDocumentContent(source, task = {}) {
  const value = unwrapDocumentOutput(source);
  const root = object(value);
  const title = text(
    root.title || root.document_title || root.name ||
    task.input?.title || task.title || "Untitled document",
  );
  const subtitle = text(root.subtitle || root.tagline || root.deck || "");
  const rawSections = list(
    root.sections || root.pages || root.slides || root.chapters || root.content?.sections,
  );
  const sections = rawSections.map((section, index) => {
    if (typeof section === "string") {
      return { heading: `Section ${index + 1}`, paragraphs: [section], bullets: [] };
    }
    const item = object(section);
    const paragraphs = list(item.paragraphs || item.body || item.content)
      .map(paragraphText)
      .filter(Boolean);
    const direct = paragraphText(item);
    if (!paragraphs.length && direct) paragraphs.push(direct);
    return {
      heading: text(item.heading || item.title || item.name || `Section ${index + 1}`),
      paragraphs,
      bullets: list(item.bullets || item.items || item.points).map(paragraphText).filter(Boolean),
    };
  }).filter((section) => section.heading || section.paragraphs.length || section.bullets.length);

  if (!sections.length) {
    sections.push({
      heading: "Content",
      paragraphs: [paragraphText(value) || text(task.description) || "Document content was not supplied."],
      bullets: [],
    });
  }

  return {
    title,
    subtitle,
    sections,
    language: text(root.language || task.input?.language || task.metadata?.language || ""),
    author: text(root.author || task.input?.author || "Avantiqo Creative Studio"),
  };
}

export function requestedDocumentFormats(task = {}) {
  const output = object(task.input?.output_spec);
  const raw = [
    ...list(output.formats),
    ...list(output.file_types),
    output.format,
    output.extension,
  ].map((value) => text(value).replace(/^\./, "").toLowerCase()).filter(Boolean);
  const deliverableType = text(task.metadata?.deliverable_type).toUpperCase();
  if (!raw.length) {
    return deliverableType === "PRESENTATION" ? ["pptx", "pdf"] : ["pdf", "docx"];
  }
  const allowed = raw.filter((value) => ["pdf", "docx", "pptx"].includes(value));
  return [...new Set(allowed.length ? allowed : ["pdf"])];
}

export function documentContentSummary(document = {}) {
  return {
    title: text(document.title),
    section_count: list(document.sections).length,
    paragraph_count: list(document.sections)
      .reduce((sum, section) => sum + list(section.paragraphs).length, 0),
    bullet_count: list(document.sections)
      .reduce((sum, section) => sum + list(section.bullets).length, 0),
  };
}
