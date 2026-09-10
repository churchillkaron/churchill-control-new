import crypto from "node:crypto";

import {
  AVANTIQO_ATTACHMENT_ANALYSIS_VERSION,
} from "./ConversationAttachmentAnalysisContract.js";

export const AVANTIQO_CONVERSATION_ATTACHMENT_SET_CONTRACT =
  "AVANTIQO_CONVERSATION_ATTACHMENT_SET_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "conversation_attachment_set";
const MEMORY_SOURCE = "conversation_attachment_runtime";
const BUCKET = "uploads";
const MAX_FILES = 8;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
const TTL_MS = 2 * 60 * 60 * 1000;
const SET_ID_PATTERN = /^[a-f0-9-]{36}$/i;
const TEXT_EXTENSIONS = new Set([
  "txt","md","mdx","csv","tsv","json","yaml","yml","xml","html","css",
  "js","jsx","ts","tsx","mjs","cjs","sql","py","log","ini","cfg","conf",
]);

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value : []; }
function actorId(context = {}) {
  return text(context?.actor?.id || context?.actor?.user_id, 160) || null;
}
function organizationId(context = {}) {
  return text(context.organizationId || context.organization_id, 160) || null;
}
function actorHash(actor) {
  return crypto.createHash("sha256").update(actor, "utf8").digest("hex").slice(0, 24);
}
function memoryKey(actor, setId) {
  return `conversation_attachment_set:v1:${actorHash(actor)}:${setId}`;
}
function extension(name) {
  const parts = String(name || "").toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}
function safeName(value) {
  const name = text(value || "attachment", 240).replaceAll("\\", "/").split("/").pop();
  const cleaned = name.normalize("NFKD").replace(/[^A-Za-z0-9._@+ -]+/g, "-").replace(/\s+/g, "-").slice(0, 180);
  if (!cleaned || cleaned === "." || cleaned === "..") throw new Error("ATTACHMENT_FILE_NAME_INVALID");
  return cleaned;
}
function isTextFile(name, mimeType) {
  const mime = text(mimeType, 160).toLowerCase();
  return TEXT_EXTENSIONS.has(extension(name)) || mime.startsWith("text/") || ["application/json","application/xml"].includes(mime);
}
function scalarCellValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "result")) return scalarCellValue(value.result);
    if (Object.prototype.hasOwnProperty.call(value, "text")) return text(value.text, 2000);
    if (Array.isArray(value.richText)) return value.richText.map((item) => text(item?.text, 500)).join("");
    if (value.hyperlink) return text(value.text || value.hyperlink, 2000);
    return text(JSON.stringify(value), 2000);
  }
  return typeof value === "string" ? text(value, 2000) : value;
}

async function spreadsheetAnalysis({ name, buffer }) {
  const ext = extension(name);
  if (!["xlsx", "xlsm"].includes(ext)) return null;
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = workbook.worksheets.slice(0, 10).map((sheet) => {
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rows.length >= 50) return;
      rows.push({
        row: rowNumber,
        values: row.values.slice(1, 31).map(scalarCellValue),
      });
    });
    return { name: sheet.name, row_count: sheet.rowCount, column_count: sheet.columnCount, rows };
  });
  return {
    status: "STRUCTURE_EXTRACTED",
    confidence: 1,
    content_excerpt: JSON.stringify({ workbook: name, sheet_count: workbook.worksheets.length, sheets }).slice(0, 120000),
    requires_content_analysis: false,
    candidate_domains: [],
    structured_file_type: "spreadsheet",
  };
}

function decodeXmlText(value) {
  return String(value || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

async function officeTextAnalysis({ name, buffer }) {
  const ext = extension(name);
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const extracted = await mammoth.extractRawText({ buffer });
    const content = text(extracted?.value, 120000);
    if (!content) return null;
    return {
      status: "TEXT_EXTRACTED", confidence: 1, content_excerpt: content,
      requires_content_analysis: false, candidate_domains: [], structured_file_type: "docx",
      extraction_messages: Array.isArray(extracted?.messages) ? extracted.messages.slice(0, 10).map((item) => text(item?.message, 500)) : [],
    };
  }
  if (ext === "pptx") {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files).filter((key) => /^ppt\/slides\/slide\d+\.xml$/i.test(key))
      .sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1] || 0) - Number(b.match(/slide(\d+)/i)?.[1] || 0));
    const slides = [];
    for (const slideName of names.slice(0, 50)) {
      const xml = await zip.file(slideName)?.async("string");
      if (!xml) continue;
      const runs = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)].map((match) => decodeXmlText(match[1]).trim()).filter(Boolean);
      slides.push({ slide: Number(slideName.match(/slide(\d+)/i)?.[1] || slides.length + 1), text: runs.join(" ") });
    }
    const content = slides.map((slide) => `Slide ${slide.slide}: ${slide.text}`).join("\n").trim();
    if (!content) return null;
    return {
      status: "TEXT_EXTRACTED", confidence: 1, content_excerpt: content.slice(0, 120000),
      requires_content_analysis: false, candidate_domains: [], structured_file_type: "pptx",
      slide_count: names.length, slides_extracted: slides.length,
    };
  }
  return null;
}

async function pdfTextAnalysis({ name, mimeType, buffer }) {
  const ext = extension(name);
  const mime = text(mimeType, 160).toLowerCase();
  if (ext !== "pdf" && mime !== "application/pdf") return null;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true });
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 20); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = (content.items || []).map((item) => text(item?.str, 4000)).filter(Boolean).join(" ");
    pages.push({ page: pageNumber, text: pageText });
  }
  const joined = pages.map((page) => `Page ${page.page}: ${page.text}`).join("\n").trim();
  if (joined.replace(/Page \d+:/g, "").trim().length < 20) {
    return {
      status: "CONTENT_ANALYSIS_REQUIRED", confidence: 0, content_excerpt: null,
      requires_content_analysis: true, candidate_domains: [], structured_file_type: "pdf",
      analysis_adapter: "owned_document_vision", pdf_text_layer_detected: false, page_count: pdf.numPages,
    };
  }
  return {
    status: "TEXT_EXTRACTED", confidence: 1, content_excerpt: joined.slice(0, 120000),
    requires_content_analysis: false, candidate_domains: [], structured_file_type: "pdf",
    pdf_text_layer_detected: true, page_count: pdf.numPages, pages_extracted: pages.length,
  };
}

async function structuredTextAnalysis({ name, buffer }) {
  const ext = extension(name);
  const raw = buffer.toString("utf8");
  if (ext === "json") {
    try {
      const parsed = JSON.parse(raw);
      return {
        status: "STRUCTURE_EXTRACTED", confidence: 1,
        content_excerpt: JSON.stringify(parsed).slice(0, 120000),
        requires_content_analysis: false, candidate_domains: [], structured_file_type: "json",
      };
    } catch {
      return null;
    }
  }
  if (["csv", "tsv"].includes(ext)) {
    const Papa = (await import("papaparse")).default;
    const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true, delimiter: ext === "tsv" ? "\t" : "" });
    const rows = Array.isArray(parsed.data) ? parsed.data.slice(0, 100) : [];
    const fields = Array.isArray(parsed.meta?.fields) ? parsed.meta.fields.slice(0, 100) : [];
    return {
      status: "STRUCTURE_EXTRACTED", confidence: parsed.errors?.length ? 0.8 : 1,
      content_excerpt: JSON.stringify({ fields, row_count: parsed.data?.length || 0, rows }).slice(0, 120000),
      requires_content_analysis: false, candidate_domains: [], structured_file_type: ext,
      parse_errors: (parsed.errors || []).slice(0, 10).map((item) => ({ code: item.code, message: item.message, row: item.row })),
    };
  }
  return null;
}

async function initialAnalysis({ name, mimeType, buffer }) {
  const spreadsheet = await spreadsheetAnalysis({ name, buffer });
  if (spreadsheet) return spreadsheet;
  const office = await officeTextAnalysis({ name, buffer });
  if (office) return office;
  const pdf = await pdfTextAnalysis({ name, mimeType, buffer });
  if (pdf) return pdf;
  const structuredText = await structuredTextAnalysis({ name, buffer });
  if (structuredText) return structuredText;
  if (isTextFile(name, mimeType)) {
    const content = buffer.toString("utf8").slice(0, 120000);
    return { status: "TEXT_EXTRACTED", confidence: 1, content_excerpt: content, requires_content_analysis: false, candidate_domains: [] };
  }
  return { status: "CONTENT_ANALYSIS_REQUIRED", confidence: 0, content_excerpt: null, requires_content_analysis: true, candidate_domains: [] };
}
async function adminClient() {
  const runtime = await import("../../shared/supabase/admin.js");
  return runtime.supabaseAdmin;
}
function storagePath({ organizationId: orgId, actor, setId, fileId, name }) {
  return `operator-attachments/${orgId}/${actorHash(actor)}/${setId}/${fileId}-${safeName(name)}`;
}

async function recentExactDuplicateIndex({ supabaseAdmin, organizationId: orgId, actor }) {
  try {
    const result = await supabaseAdmin.from(MEMORY_TABLE)
      .select("metadata,updated_at")
      .eq("organization_id", orgId)
      .eq("memory_scope", MEMORY_SCOPE)
      .eq("source", MEMORY_SOURCE)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (result.error) throw result.error;
    const index = new Map();
    const now = Date.now();
    for (const row of list(result.data)) {
      const metadata = object(row.metadata);
      if (text(metadata.actor_id, 160) !== actor) continue;
      const expiresAt = Date.parse(text(metadata.expires_at, 120));
      if (!Number.isFinite(expiresAt) || expiresAt <= now) continue;
      for (const stored of list(metadata.files)) {
        const file = object(stored);
        const sha = text(file.sha256, 128);
        if (!sha || index.has(sha)) continue;
        index.set(sha, {
          attachment_set_id: text(metadata.attachment_set_id, 80) || null,
          file_id: text(file.id, 80) || null,
          analysis: object(file.analysis),
          seen_at: text(metadata.created_at, 120) || text(row.updated_at, 120) || null,
        });
      }
    }
    return index;
  } catch (error) {
    console.error("ATTACHMENT_DUPLICATE_INDEX_FAILED", error);
    return new Map();
  }
}

export async function createConversationAttachmentSet({ context = {}, files = [] } = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  if (!orgId) throw new Error("ATTACHMENT_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("ATTACHMENT_ACTOR_REQUIRED");
  const requested = list(files);
  if (!requested.length) throw new Error("ATTACHMENTS_REQUIRED");
  if (requested.length > MAX_FILES) throw new Error(`ATTACHMENT_FILE_LIMIT_EXCEEDED:${MAX_FILES}`);
  const preparedFiles = [];
  let totalBytes = 0;
  for (let index = 0; index < requested.length; index += 1) {
    const file = requested[index];
    const name = safeName(file?.name || `attachment-${index + 1}`);
    const mimeType = text(file?.type, 160) || "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.length) throw new Error(`ATTACHMENT_FILE_EMPTY:${name}`);
    if (buffer.length > MAX_FILE_BYTES) throw new Error(`ATTACHMENT_FILE_TOO_LARGE:${name}:${MAX_FILE_BYTES}`);
    totalBytes += buffer.length;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error(`ATTACHMENT_SET_TOO_LARGE:${MAX_TOTAL_BYTES}`);
    preparedFiles.push({ file, name, mimeType, buffer });
  }

  const setId = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + TTL_MS);
  const supabaseAdmin = await adminClient();
  const priorDuplicates = await recentExactDuplicateIndex({ supabaseAdmin, organizationId: orgId, actor });
  const currentSetHashes = new Map();
  const storedFiles = [];
  for (let index = 0; index < preparedFiles.length; index += 1) {
    const { name, mimeType, buffer } = preparedFiles[index];
    const fileId = `file_${index + 1}`;
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const priorDuplicate = currentSetHashes.get(sha256) || priorDuplicates.get(sha256) || null;
    const path = storagePath({ organizationId: orgId, actor, setId, fileId, name });
    const extractedAnalysis = await initialAnalysis({ name, mimeType, buffer });
    const priorAnalysis = object(priorDuplicate?.analysis);
    const reusablePriorAnalysis = priorDuplicate && priorAnalysis.status === "ANALYZED"
      && text(priorAnalysis.analysis_version, 160) === AVANTIQO_ATTACHMENT_ANALYSIS_VERSION
      ? priorAnalysis
      : null;
    const analysis = reusablePriorAnalysis || extractedAnalysis;
    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
      contentType: mimeType,
      upsert: false,
      cacheControl: "3600",
    });
    if (uploadError) throw uploadError;
    storedFiles.push({
      id: fileId,
      name,
      mime_type: mimeType,
      size_bytes: buffer.length,
      sha256,
      storage_path: path,
      analysis,
      exact_duplicate: priorDuplicate ? {
        exact_bytes: true,
        prior_attachment_set_id: priorDuplicate.attachment_set_id || setId,
        prior_file_id: priorDuplicate.file_id || null,
        seen_at: priorDuplicate.seen_at || createdAt.toISOString(),
        analysis_reused: Boolean(reusablePriorAnalysis),
        authorization_effect: "NONE",
      } : null,
      user_selected: true,
      authorization_effect: "NONE",
    });
    currentSetHashes.set(sha256, {
      attachment_set_id: setId, file_id: fileId, analysis, seen_at: createdAt.toISOString(),
    });
  }
  const result = await supabaseAdmin.from(MEMORY_TABLE).insert({
    organization_id: orgId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: MEMORY_SCOPE,
    memory_key: memoryKey(actor, setId),
    memory_type: "fact",
    subject: "Conversation Attachment Set",
    content: `Ephemeral Business Partner attachments: ${storedFiles.map((file) => file.name).join(", ")}.`,
    importance: 0.01,
    confidence: 1,
    source: MEMORY_SOURCE,
    active: true,
    metadata: {
      contract: AVANTIQO_CONVERSATION_ATTACHMENT_SET_CONTRACT,
      attachment_set_id: setId,
      actor_id: actor,
      created_at: createdAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      files: storedFiles,
      file_count: storedFiles.length,
      total_size_bytes: totalBytes,
      read_only_evidence: true,
      authorization_effect: "NONE",
      ordinary_memory_recall: false,
    },
    updated_at: createdAt.toISOString(),
  }).select("id").maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.id) throw new Error("ATTACHMENT_SET_PERSIST_FAILED");
  return {
    created: true,
    attachment_set_id: setId,
    expires_at: expiresAt.toISOString(),
    files: storedFiles.map(({ storage_path, ...file }) => file),
  };
}
export async function loadConversationAttachmentSet({ context = {}, attachment_set_id = null } = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  const setId = text(attachment_set_id, 80);
  if (!orgId || !actor || !SET_ID_PATTERN.test(setId)) return { found: false, files: [] };
  const supabaseAdmin = await adminClient();
  const result = await supabaseAdmin.from(MEMORY_TABLE)
    .select("id,metadata")
    .eq("organization_id", orgId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", memoryKey(actor, setId))
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.id) return { found: false, files: [] };
  const metadata = object(result.data.metadata);
  if (text(metadata.contract, 160) !== AVANTIQO_CONVERSATION_ATTACHMENT_SET_CONTRACT || text(metadata.actor_id, 160) !== actor) {
    throw new Error("ATTACHMENT_SET_SCOPE_MISMATCH");
  }
  const expiresAt = Date.parse(text(metadata.expires_at, 120));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return { found: false, expired: true, files: [] };
  const files = [];
  for (const file of list(metadata.files)) {
    const stored = object(file);
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(text(stored.storage_path, 1000), 15 * 60);
    if (error) throw error;
    files.push({
      id: text(stored.id, 80), attachment_set_id: setId, name: text(stored.name, 240), mime_type: text(stored.mime_type, 160),
      size_bytes: Number(stored.size_bytes) || 0, sha256: text(stored.sha256, 128),
      url: data?.signedUrl || null, analysis: object(stored.analysis),
      exact_duplicate: Object.keys(object(stored.exact_duplicate)).length ? object(stored.exact_duplicate) : null,
      user_selected: true, authorization_effect: "NONE",
    });
  }
  return { found: true, attachment_set_id: setId, expires_at: metadata.expires_at, files, authorization_effect: "NONE" };
}
export async function persistConversationAttachmentAnalysis({ context = {}, attachment_set_id = null, files = [], analysis_version = null } = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  const setId = text(attachment_set_id, 80);
  const version = text(analysis_version, 160);
  if (!orgId || !actor || !SET_ID_PATTERN.test(setId) || !version) return { persisted: false };
  const successful = new Map(
    list(files)
      .filter((file) => object(file.analysis).status === "ANALYZED" && text(file.analysis.analysis_version, 160) === version)
      .map((file) => [`${text(file.id, 80)}:${text(file.sha256, 128)}`, object(file.analysis)]),
  );
  if (!successful.size) return { persisted: false, cached_file_count: 0 };
  const supabaseAdmin = await adminClient();
  const current = await supabaseAdmin.from(MEMORY_TABLE)
    .select("id,metadata")
    .eq("organization_id", orgId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", memoryKey(actor, setId))
    .eq("active", true)
    .maybeSingle();
  if (current.error) throw current.error;
  if (!current.data?.id) return { persisted: false, cached_file_count: 0 };
  const metadata = object(current.data.metadata);
  if (text(metadata.contract, 160) !== AVANTIQO_CONVERSATION_ATTACHMENT_SET_CONTRACT || text(metadata.actor_id, 160) !== actor) {
    throw new Error("ATTACHMENT_SET_SCOPE_MISMATCH");
  }
  const expiresAt = Date.parse(text(metadata.expires_at, 120));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return { persisted: false, expired: true, cached_file_count: 0 };
  let changed = 0;
  const nextFiles = list(metadata.files).map((stored) => {
    const source = object(stored);
    const cached = successful.get(`${text(source.id, 80)}:${text(source.sha256, 128)}`);
    if (!cached) return source;
    changed += 1;
    return { ...source, analysis: cached };
  });
  if (!changed) return { persisted: false, cached_file_count: 0 };
  const update = await supabaseAdmin.from(MEMORY_TABLE)
    .update({ metadata: { ...metadata, files: nextFiles, analysis_version: version }, updated_at: new Date().toISOString() })
    .eq("id", current.data.id)
    .eq("organization_id", orgId);
  if (update.error) throw update.error;
  return { persisted: true, cached_file_count: changed, analysis_version: version, authorization_effect: "NONE" };
}

export function conversationAttachmentSetIdFromRequest(request) {
  const value = text(request?.headers?.get?.("x-avantiqo-attachment-set"), 80);
  return SET_ID_PATTERN.test(value) ? value : null;
}

export const ConversationAttachmentRuntime = Object.freeze({
  contract: AVANTIQO_CONVERSATION_ATTACHMENT_SET_CONTRACT,
  max_files: MAX_FILES,
  max_file_bytes: MAX_FILE_BYTES,
  ttl_ms: TTL_MS,
  create: createConversationAttachmentSet,
  load: loadConversationAttachmentSet,
  persistAnalysis: persistConversationAttachmentAnalysis,
  fromRequest: conversationAttachmentSetIdFromRequest,
});

export default ConversationAttachmentRuntime;

export async function extractConversationAttachmentContent({ name, mimeType = "application/octet-stream", buffer } = {}) {
  if (!Buffer.isBuffer(buffer)) throw new Error("ATTACHMENT_EXTRACTION_BUFFER_REQUIRED");
  return initialAnalysis({ name, mimeType, buffer });
}
