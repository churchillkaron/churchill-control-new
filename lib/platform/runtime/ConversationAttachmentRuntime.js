import crypto from "node:crypto";

export const AVANTIQO_CONVERSATION_ATTACHMENT_SET_CONTRACT =
  "AVANTIQO_CONVERSATION_ATTACHMENT_SET_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "conversation_attachment_set";
const MEMORY_SOURCE = "conversation_attachment_runtime";
const BUCKET = "uploads";
const MAX_FILES = 8;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
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
function initialAnalysis({ name, mimeType, buffer }) {
  if (isTextFile(name, mimeType)) {
    const content = buffer.toString("utf8").slice(0, 120000);
    return {
      status: "TEXT_EXTRACTED",
      confidence: 1,
      content_excerpt: content,
      requires_content_analysis: false,
      candidate_domains: [],
    };
  }
  return {
    status: "CONTENT_ANALYSIS_REQUIRED",
    confidence: 0,
    content_excerpt: null,
    requires_content_analysis: true,
    candidate_domains: [],
  };
}
async function adminClient() {
  const runtime = await import("../../shared/supabase/admin.js");
  return runtime.supabaseAdmin;
}
function storagePath({ organizationId: orgId, actor, setId, fileId, name }) {
  return `operator-attachments/${orgId}/${actorHash(actor)}/${setId}/${fileId}-${safeName(name)}`;
}

export async function createConversationAttachmentSet({ context = {}, files = [] } = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  if (!orgId) throw new Error("ATTACHMENT_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("ATTACHMENT_ACTOR_REQUIRED");
  const requested = list(files);
  if (!requested.length) throw new Error("ATTACHMENTS_REQUIRED");
  if (requested.length > MAX_FILES) throw new Error(`ATTACHMENT_FILE_LIMIT_EXCEEDED:${MAX_FILES}`);
  const setId = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + TTL_MS);
  const supabaseAdmin = await adminClient();
  const storedFiles = [];
  for (let index = 0; index < requested.length; index += 1) {
    const file = requested[index];
    const name = safeName(file?.name || `attachment-${index + 1}`);
    const mimeType = text(file?.type, 160) || "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.length) throw new Error(`ATTACHMENT_FILE_EMPTY:${name}`);
    if (buffer.length > MAX_FILE_BYTES) throw new Error(`ATTACHMENT_FILE_TOO_LARGE:${name}:${MAX_FILE_BYTES}`);
    const fileId = `file_${index + 1}`;
    const path = storagePath({ organizationId: orgId, actor, setId, fileId, name });
    const analysis = initialAnalysis({ name, mimeType, buffer });
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
      sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
      storage_path: path,
      analysis,
      user_selected: true,
      authorization_effect: "NONE",
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
      id: text(stored.id, 80), name: text(stored.name, 240), mime_type: text(stored.mime_type, 160),
      size_bytes: Number(stored.size_bytes) || 0, sha256: text(stored.sha256, 128),
      url: data?.signedUrl || null, analysis: object(stored.analysis), user_selected: true,
      authorization_effect: "NONE",
    });
  }
  return { found: true, attachment_set_id: setId, expires_at: metadata.expires_at, files, authorization_effect: "NONE" };
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
  fromRequest: conversationAttachmentSetIdFromRequest,
});

export default ConversationAttachmentRuntime;
