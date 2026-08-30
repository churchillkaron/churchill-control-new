import crypto from "node:crypto";

export const AVANTIQO_DEVELOPER_ATTACHMENT_SET_CONTRACT =
  "AVANTIQO_DEVELOPER_ATTACHMENT_SET_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "developer_attachment_set";
const MEMORY_SOURCE = "developer_attachment_runtime";
const MAX_FILES = 4;
const MAX_FILE_CHARS = 120_000;
const MAX_TOTAL_CHARS = 240_000;
const TTL_MS = 30 * 60 * 1000;
const SET_ID_PATTERN = /^[a-f0-9-]{36}$/i;
const ALLOWED_TEXT_EXTENSIONS = new Set([
  "txt", "md", "mdx", "js", "jsx", "ts", "tsx", "mjs", "cjs", "json",
  "yaml", "yml", "toml", "ini", "cfg", "conf", "css", "scss", "html",
  "xml", "sql", "py", "go", "rs", "java", "kt", "rb", "php", "swift",
  "c", "cc", "cpp", "h", "hpp", "sh", "zsh", "fish", "log", "csv", "tsv",
]);

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

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
  return `developer_attachment_set:v1:${actorHash(actor)}:${setId}`;
}

function safeName(value) {
  const name = text(value || "attachment.txt", 240).replaceAll("\\", "/").split("/").pop();
  if (!name || name === "." || name === "..") {
    throw new Error("DEVELOPER_ATTACHMENT_FILE_NAME_INVALID");
  }
  if (
    /^\.env(?:\.|$)/i.test(name) ||
    /(?:^|[._-])(secret|secrets|credential|credentials|private[-_ ]?key)(?:[._-]|$)/i.test(name) ||
    /\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(name)
  ) {
    throw new Error(`DEVELOPER_ATTACHMENT_SENSITIVE_FILE_BLOCKED:${name}`);
  }
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._@+ -]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  if (!cleaned) throw new Error("DEVELOPER_ATTACHMENT_FILE_NAME_INVALID");
  return cleaned;
}

function extension(name) {
  const parts = String(name).toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

function assertTextFile(name, mimeType) {
  const ext = extension(name);
  const mime = text(mimeType, 160).toLowerCase();
  const textualMime =
    mime.startsWith("text/") ||
    [
      "application/json",
      "application/javascript",
      "application/typescript",
      "application/xml",
      "application/sql",
      "application/yaml",
      "application/x-yaml",
    ].includes(mime);
  if (!ALLOWED_TEXT_EXTENSIONS.has(ext) && !textualMime) {
    throw new Error(`DEVELOPER_ATTACHMENT_TEXT_FILE_REQUIRED:${name}`);
  }
}

function normalizeAttachments(value) {
  const requested = list(value);
  if (!requested.length) return [];
  if (requested.length > MAX_FILES) {
    throw new Error(`DEVELOPER_ATTACHMENT_FILE_LIMIT_EXCEEDED:${MAX_FILES}`);
  }
  let totalChars = 0;
  const seen = new Set();
  return requested.map((candidate, index) => {
    const source = object(candidate);
    const name = safeName(source.name || source.file_name || `attachment-${index + 1}.txt`);
    assertTextFile(name, source.type || source.mime_type);
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error(`DEVELOPER_ATTACHMENT_DUPLICATE_FILE_NAME:${name}`);
    seen.add(key);
    const content = String(source.content ?? "");
    if (!content.trim()) throw new Error(`DEVELOPER_ATTACHMENT_FILE_EMPTY:${name}`);
    if (content.length > MAX_FILE_CHARS) {
      throw new Error(`DEVELOPER_ATTACHMENT_FILE_TOO_LARGE:${name}:${MAX_FILE_CHARS}`);
    }
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      throw new Error(`DEVELOPER_ATTACHMENT_TOTAL_SIZE_EXCEEDED:${MAX_TOTAL_CHARS}`);
    }
    return {
      id: `file_${index + 1}`,
      name,
      mime_type: text(source.type || source.mime_type, 160) || "text/plain",
      size_bytes: Number.isFinite(Number(source.size || source.size_bytes))
        ? Math.max(0, Math.floor(Number(source.size || source.size_bytes)))
        : Buffer.byteLength(content, "utf8"),
      content,
      sha256: crypto.createHash("sha256").update(content, "utf8").digest("hex"),
      user_selected: true,
      read_only_evidence: true,
      authorization_effect: "NONE",
    };
  });
}

async function adminClient() {
  const runtime = await import("../../shared/supabase/admin.js");
  return runtime.supabaseAdmin;
}

export async function createDeveloperAttachmentSet({
  context = {},
  attachments = [],
} = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  if (!orgId) throw new Error("DEVELOPER_ATTACHMENT_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("DEVELOPER_ATTACHMENT_ACTOR_REQUIRED");
  const files = normalizeAttachments(attachments);
  if (!files.length) return { created: false, attachment_set_id: null, files: [] };

  const setId = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + TTL_MS);
  const supabaseAdmin = await adminClient();
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert({
      organization_id: orgId,
      party_id: null,
      entity_id: null,
      conversation_id: null,
      source_turn_id: null,
      memory_scope: MEMORY_SCOPE,
      memory_key: memoryKey(actor, setId),
      memory_type: "fact",
      subject: "Developer Attachment Set",
      content: `Ephemeral developer evidence selected by the operator: ${files.map((file) => file.name).join(", ")}.`,
      importance: 0.01,
      confidence: 1,
      source: MEMORY_SOURCE,
      active: true,
      metadata: {
        contract: AVANTIQO_DEVELOPER_ATTACHMENT_SET_CONTRACT,
        attachment_set_id: setId,
        actor_id: actor,
        created_at: createdAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        files,
        file_count: files.length,
        ordinary_memory_recall: false,
        read_only_evidence: true,
        authorization_effect: "NONE",
        source_mutation_authority: false,
        credential_authority: false,
        production_deploy_authority: false,
      },
      updated_at: createdAt.toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.id) throw new Error("DEVELOPER_ATTACHMENT_SET_PERSIST_FAILED");

  return {
    created: true,
    attachment_set_id: setId,
    expires_at: expiresAt.toISOString(),
    files: files.map(({ content, ...file }) => file),
    raw_content_returned: false,
  };
}

export async function loadDeveloperAttachmentSet({
  context = {},
  attachment_set_id = null,
} = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  const setId = text(attachment_set_id, 80);
  if (!orgId || !actor || !SET_ID_PATTERN.test(setId)) {
    return { found: false, files: [] };
  }
  const supabaseAdmin = await adminClient();
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,updated_at")
    .eq("organization_id", orgId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", memoryKey(actor, setId))
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.id) return { found: false, files: [] };
  const metadata = object(result.data.metadata);
  if (
    text(metadata.contract, 160) !== AVANTIQO_DEVELOPER_ATTACHMENT_SET_CONTRACT ||
    text(metadata.actor_id, 160) !== actor ||
    text(metadata.attachment_set_id, 80) !== setId
  ) {
    throw new Error("DEVELOPER_ATTACHMENT_SET_SCOPE_MISMATCH");
  }
  const expiresAt = Date.parse(text(metadata.expires_at, 120));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { found: false, expired: true, files: [] };
  }
  const files = normalizeAttachments(metadata.files);
  return {
    found: true,
    attachment_set_id: setId,
    expires_at: metadata.expires_at,
    files,
    read_only_evidence: true,
    authorization_effect: "NONE",
  };
}

export function developerAttachmentSetIdFromRequest(request) {
  const value = text(request?.headers?.get?.("x-avantiqo-developer-attachment-set"), 80);
  return SET_ID_PATTERN.test(value) ? value : null;
}

export function projectDeveloperAttachmentEvidence(loaded = {}) {
  if (loaded?.found !== true) return [];
  return list(loaded.files).map((file) => {
    const content = String(file.content ?? "");
    const headChars = Math.min(7000, content.length);
    const tailChars = content.length > headChars ? Math.min(2000, content.length - headChars) : 0;
    const excerpt = tailChars
      ? `${content.slice(0, headChars)}\n\n...[middle omitted from live Code context]...\n\n${content.slice(-tailChars)}`
      : content.slice(0, headChars);
    return {
      file_path: `developer-attachment://${loaded.attachment_set_id}/${file.id}/${file.name}`,
      name: file.name,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      sha256: file.sha256,
      total_lines: content.split("\n").length,
      content: excerpt,
      content_truncated: excerpt.length < content.length,
      user_selected: true,
      read_only_evidence: true,
      authorization_effect: "NONE",
    };
  });
}

export const DeveloperAttachmentRuntime = Object.freeze({
  contract: AVANTIQO_DEVELOPER_ATTACHMENT_SET_CONTRACT,
  max_files: MAX_FILES,
  max_file_chars: MAX_FILE_CHARS,
  max_total_chars: MAX_TOTAL_CHARS,
  ttl_ms: TTL_MS,
  create: createDeveloperAttachmentSet,
  load: loadDeveloperAttachmentSet,
  fromRequest: developerAttachmentSetIdFromRequest,
  projectEvidence: projectDeveloperAttachmentEvidence,
});

export default DeveloperAttachmentRuntime;
