import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";
import { renderDocumentPdf } from "@/lib/creative/documents/runtime/DocumentPdfRuntime";
import { renderDocumentDocx, renderDocumentPptx } from "@/lib/creative/documents/runtime/DocumentOfficeRuntime";
import { createStoredZip, xmlEscape } from "@/lib/creative/documents/runtime/OpenXmlPackageRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_OFFICE_ARTIFACT_PREPARATION_V1";
const SOURCE = "secretary_office_artifact_preparation";
const REGISTER_KEY = "office_artifact_preparation_v1";
const DOCUMENT_PREPARATION_SOURCE = "secretary_document_preparation";
const DOCUMENT_PREPARATION_REGISTER_KEY = "document_preparation_v1";
const ARTIFACT_TYPES = new Set(["DOCUMENT", "SPREADSHEET"]);
const DOCUMENT_FORMATS = new Set(["PDF", "DOCX", "PPTX"]);
const SPREADSHEET_FORMATS = new Set(["XLSX"]);
const ACTIVE_STATES = new Set(["PREPARED"]);
const MAX_SHEETS = 10;
const MAX_ROWS_PER_SHEET = 5000;
const MAX_COLUMNS = 100;
const MAX_TOTAL_CELLS = 100000;
const MAX_CELL_CHARS = 5000;
const MAX_SNAPSHOT_BYTES = 2_000_000;
const MAX_RENDER_BYTES = 12_000_000;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function exactString(value, field, limit = MAX_CELL_CHARS) {
  if (typeof value !== "string") throw new Error(`SECRETARY_OFFICE_ARTIFACT_${field.toUpperCase()}_MUST_BE_STRING`);
  if (value.length > limit) throw new Error(`SECRETARY_OFFICE_ARTIFACT_${field.toUpperCase()}_TOO_LARGE`);
  return value;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function organizationId(context = {}) {
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

function actorPartyId(context = {}) {
  const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return id;
}

function iso(value, field) {
  const raw = text(value, 180);
  if (!raw) throw new Error(`SECRETARY_OFFICE_ARTIFACT_${field.toUpperCase()}_REQUIRED`);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_OFFICE_ARTIFACT_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function deterministicUuid(seed) {
  const chars = sha256(seed).slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const raw = chars.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function safetyFlags() {
  return {
    source_snapshot_frozen: true,
    source_data_inferred: false,
    factual_accuracy_verified: false,
    legal_accuracy_verified: false,
    business_approval_inferred: false,
    spreadsheet_formula_execution_enabled: false,
    spreadsheet_formula_created: false,
    artifact_content_stored_in_database: false,
    artifact_bytes_persisted: false,
    external_storage_write_performed: false,
    document_published: false,
    document_filed: false,
    external_sharing_performed: false,
    correspondence_sent: false,
    signature_applied: false,
    binding_submission_performed: false,
    finance_posting_performed: false,
    payment_authority_created: false,
    signing_authority_created: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    provider_calls_performed: false,
    external_authority_used: false,
  };
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

async function routingFor({ context, instruction, at }) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const owner = text(await resolveSecretaryCanonicalOwner({ organizationId: organization }), 120) || actor;
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId: owner,
    scope: "DOCUMENT_COORDINATION",
    instruction,
    at,
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_OFFICE_ARTIFACT_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || owner;
  if (actor !== owner && actor !== operational) throw new Error("SECRETARY_OFFICE_ARTIFACT_ACTOR_NOT_AUTHORIZED");
  return { organization, actor, owner, operational, routing };
}

function normalizeArtifactType(value) {
  const kind = text(value, 80).toUpperCase();
  if (!ARTIFACT_TYPES.has(kind)) throw new Error("SECRETARY_OFFICE_ARTIFACT_TYPE_INVALID");
  return kind;
}

function normalizeFormats(type, value) {
  const allowed = type === "DOCUMENT" ? DOCUMENT_FORMATS : SPREADSHEET_FORMATS;
  const raw = list(value).map((entry) => text(entry, 40).toUpperCase()).filter(Boolean);
  if (!raw.length) throw new Error("SECRETARY_OFFICE_ARTIFACT_FORMATS_REQUIRED");
  const formats = [...new Set(raw)];
  for (const format of formats) {
    if (!allowed.has(format)) throw new Error(`SECRETARY_OFFICE_ARTIFACT_FORMAT_INVALID:${format}`);
  }
  return formats;
}

function cleanXml(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function safeFilename(value, fallback = "office-artifact") {
  const normalized = text(value, 240)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

function mimeFor(format) {
  return {
    PDF: "application/pdf",
    DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    PPTX: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }[format] || "application/octet-stream";
}

function extensionFor(format) {
  return format.toLowerCase();
}

function assertSnapshotSize(snapshot) {
  const bytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
  if (bytes > MAX_SNAPSHOT_BYTES) throw new Error("SECRETARY_OFFICE_ARTIFACT_SOURCE_SNAPSHOT_TOO_LARGE");
  return bytes;
}

async function loadFinalDocumentPreparation(organization, preparationId, expectedVersion) {
  const id = text(preparationId, 120);
  if (!id) throw new Error("SECRETARY_OFFICE_ARTIFACT_SOURCE_PREPARATION_ID_REQUIRED");
  const version = Number(expectedVersion);
  if (!Number.isInteger(version) || version < 1) throw new Error("SECRETARY_OFFICE_ARTIFACT_SOURCE_PREPARATION_VERSION_REQUIRED");
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("id,source,status,metadata,updated_at")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!task || task.source !== DOCUMENT_PREPARATION_SOURCE) throw new Error("SECRETARY_OFFICE_ARTIFACT_SOURCE_PREPARATION_NOT_FOUND");
  const register = object(object(task.metadata)[DOCUMENT_PREPARATION_REGISTER_KEY]);
  if (!register.contract || register.state !== "FINAL") throw new Error("SECRETARY_OFFICE_ARTIFACT_SOURCE_PREPARATION_NOT_FINAL");
  if (Number(register.version) !== version) throw new Error("SECRETARY_OFFICE_ARTIFACT_SOURCE_PREPARATION_STALE_VERSION");
  const exactPreparedText = typeof register.exact_prepared_text === "string" ? register.exact_prepared_text : "";
  if (!exactPreparedText) throw new Error("SECRETARY_OFFICE_ARTIFACT_SOURCE_PREPARED_TEXT_REQUIRED");
  const actualHash = sha256(exactPreparedText);
  if (actualHash !== register.prepared_sha256) throw new Error("SECRETARY_OFFICE_ARTIFACT_SOURCE_PREPARED_HASH_INVALID");
  const snapshot = {
    source_kind: "SECRETARY_DOCUMENT_PREPARATION",
    preparation_id: task.id,
    preparation_version: version,
    document_kind: text(register.kind, 80) || "GENERAL_DOCUMENT",
    title: text(register.title, 600) || "Prepared document",
    exact_prepared_text: exactPreparedText,
    prepared_sha256: actualHash,
    finalized_at: register.finalized_at || null,
    source_reference: register.source_reference || null,
  };
  assertSnapshotSize(snapshot);
  return snapshot;
}

function normalizeCell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("SECRETARY_OFFICE_ARTIFACT_SPREADSHEET_NUMBER_INVALID");
    return value;
  }
  if (typeof value === "string") return exactString(value, "spreadsheet_cell");
  throw new Error("SECRETARY_OFFICE_ARTIFACT_SPREADSHEET_CELL_TYPE_INVALID");
}

function uniqueSheetName(value, used, index) {
  const base = (text(value, 80) || `Sheet ${index + 1}`)
    .replace(/[\\/*?:\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || `Sheet ${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    const tail = ` ${suffix}`;
    candidate = `${base.slice(0, Math.max(1, 31 - tail.length))}${tail}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function normalizeSpreadsheetSnapshot(payload = {}) {
  const title = text(payload.title, 600);
  if (!title) throw new Error("SECRETARY_OFFICE_ARTIFACT_SPREADSHEET_TITLE_REQUIRED");
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1200);
  if (!sourceReference) throw new Error("SECRETARY_OFFICE_ARTIFACT_SPREADSHEET_SOURCE_REFERENCE_REQUIRED");
  const incomingSheets = list(payload.sheets);
  if (!incomingSheets.length) throw new Error("SECRETARY_OFFICE_ARTIFACT_SPREADSHEET_SHEETS_REQUIRED");
  if (incomingSheets.length > MAX_SHEETS) throw new Error("SECRETARY_OFFICE_ARTIFACT_SPREADSHEET_TOO_MANY_SHEETS");
  const usedNames = new Set();
  let totalCells = 0;
  const sheets = incomingSheets.map((entry, sheetIndex) => {
    const sheet = object(entry);
    const name = uniqueSheetName(sheet.name, usedNames, sheetIndex);
    const headers = list(sheet.headers).map((header) => exactString(header, "spreadsheet_header", 500));
    if (!headers.length) throw new Error("SECRETARY_OFFICE_ARTIFACT_SPREADSHEET_HEADERS_REQUIRED");
    if (headers.length > MAX_COLUMNS) throw new Error("SECRETARY_OFFICE_ARTIFACT_SPREADSHEET_TOO_MANY_COLUMNS");
    const rows = list(sheet.rows);
    if (rows.length > MAX_ROWS_PER_SHEET) throw new Error("SECRETARY_OFFICE_ARTIFACT_SPREADSHEET_TOO_MANY_ROWS");
    const normalizedRows = rows.map((row) => {
      if (!Array.isArray(row)) throw new Error("SECRETARY_OFFICE_ARTIFACT_SPREADSHEET_ROW_MUST_BE_ARRAY");
      if (row.length !== headers.length) throw new Error("SECRETARY_OFFICE_ARTIFACT_SPREADSHEET_ROW_WIDTH_MISMATCH");
      totalCells += row.length;
      if (totalCells > MAX_TOTAL_CELLS) throw new Error("SECRETARY_OFFICE_ARTIFACT_SPREADSHEET_TOO_MANY_CELLS");
      return row.map(normalizeCell);
    });
    totalCells += headers.length;
    if (totalCells > MAX_TOTAL_CELLS) throw new Error("SECRETARY_OFFICE_ARTIFACT_SPREADSHEET_TOO_MANY_CELLS");
    return { name, headers, rows: normalizedRows };
  });
  const snapshot = {
    source_kind: "EXPLICIT_SPREADSHEET_DATA",
    title,
    source_reference: sourceReference,
    sheets,
    formula_policy: "INLINE_VALUES_ONLY_NO_FORMULAS",
  };
  assertSnapshotSize(snapshot);
  return snapshot;
}

function documentForRender(snapshot) {
  const normalized = String(snapshot.exact_prepared_text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = normalized.split("\n").map((line) => line || " ");
  return {
    title: snapshot.title,
    subtitle: snapshot.document_kind ? snapshot.document_kind.replace(/_/g, " ") : null,
    sections: [{ heading: "Prepared content", paragraphs, bullets: [] }],
  };
}

function columnReference(index) {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function worksheetCell(value, ref, style = 0) {
  const styleAttribute = style ? ` s="${style}"` : "";
  if (value === null || value === undefined) return `<c r="${ref}"${styleAttribute}/>`;
  if (typeof value === "number") return `<c r="${ref}"${styleAttribute}><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c r="${ref}" t="b"${styleAttribute}><v>${value ? 1 : 0}</v></c>`;
  const escaped = xmlEscape(cleanXml(value));
  return `<c r="${ref}" t="inlineStr"${styleAttribute}><is><t xml:space="preserve">${escaped}</t></is></c>`;
}

function worksheetXml(sheet) {
  const rows = [];
  const headerCells = sheet.headers.map((value, index) => worksheetCell(value, `${columnReference(index)}1`, 1)).join("");
  rows.push(`<row r="1">${headerCells}</row>`);
  sheet.rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const cells = row.map((value, columnIndex) => worksheetCell(value, `${columnReference(columnIndex)}${rowNumber}`)).join("");
    rows.push(`<row r="${rowNumber}">${cells}</row>`);
  });
  const lastColumn = columnReference(Math.max(0, sheet.headers.length - 1));
  const lastRow = sheet.rows.length + 1;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${rows.join("")}</sheetData><autoFilter ref="A1:${lastColumn}${lastRow}"/></worksheet>`;
}

function renderSpreadsheetXlsx(snapshot) {
  const sheetOverrides = snapshot.sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const workbookSheets = snapshot.sheets.map((sheet, index) => `<sheet name="${xmlEscape(cleanXml(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const relationships = snapshot.sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const styleRelationshipId = `rId${snapshot.sheets.length + 1}`;
  const entries = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="${styleRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: "xl/styles.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    },
  ];
  snapshot.sheets.forEach((sheet, index) => entries.push({ name: `xl/worksheets/sheet${index + 1}.xml`, data: worksheetXml(sheet) }));
  return createStoredZip(entries, { created_at: new Date("2000-01-01T00:00:00.000Z") });
}

function renderBuffer(type, format, snapshot) {
  if (type === "DOCUMENT") {
    const document = documentForRender(snapshot);
    if (format === "PDF") return renderDocumentPdf(document);
    if (format === "DOCX") return renderDocumentDocx(document);
    if (format === "PPTX") return renderDocumentPptx(document);
  }
  if (type === "SPREADSHEET" && format === "XLSX") return renderSpreadsheetXlsx(snapshot);
  throw new Error(`SECRETARY_OFFICE_ARTIFACT_RENDER_UNSUPPORTED:${type}:${format}`);
}

function validateRenderedBuffer(format, buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error(`SECRETARY_OFFICE_ARTIFACT_${format}_EMPTY`);
  if (buffer.length > MAX_RENDER_BYTES) throw new Error(`SECRETARY_OFFICE_ARTIFACT_${format}_TOO_LARGE`);
  if (format === "PDF" && !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("SECRETARY_OFFICE_ARTIFACT_PDF_SIGNATURE_INVALID");
  if (["DOCX", "PPTX", "XLSX"].includes(format)) {
    const zip = buffer.length > 22 && buffer.readUInt32LE(0) === 0x04034b50 && buffer.includes(Buffer.from("[Content_Types].xml"));
    if (!zip) throw new Error(`SECRETARY_OFFICE_ARTIFACT_${format}_PACKAGE_INVALID`);
  }
  if (format === "XLSX" && !buffer.includes(Buffer.from("xl/workbook.xml"))) throw new Error("SECRETARY_OFFICE_ARTIFACT_XLSX_WORKBOOK_MISSING");
}

function renderFiles(type, formats, snapshot, includeContent = false) {
  return formats.map((format) => {
    const buffer = renderBuffer(type, format, snapshot);
    validateRenderedBuffer(format, buffer);
    return {
      format,
      filename: `${safeFilename(snapshot.title)}.${extensionFor(format)}`,
      mime_type: mimeFor(format),
      file_size_bytes: buffer.length,
      checksum_sha256: sha256(buffer),
      content_base64: includeContent ? buffer.toString("base64") : undefined,
    };
  });
}

function manifestFromFiles(files) {
  return files.map(({ content_base64, ...entry }) => entry);
}

function contentIdentity(type, formats, snapshot) {
  return sha256(JSON.stringify({ contract: CONTRACT, renderer_version: 1, type, formats, snapshot }));
}

function artifactVersion({ version, type, formats, snapshot, preparedAt, evidenceId }) {
  const rendered = renderFiles(type, formats, snapshot, false);
  return {
    version,
    artifact_type: type,
    formats,
    source_snapshot: snapshot,
    source_snapshot_sha256: sha256(JSON.stringify(snapshot)),
    content_identity_sha256: contentIdentity(type, formats, snapshot),
    initial_render_manifest: manifestFromFiles(rendered),
    prepared_at: preparedAt,
    evidence_id: evidenceId,
    ...safetyFlags(),
  };
}

function registerFromTask(task) {
  const register = object(object(task?.metadata)[REGISTER_KEY]);
  if (register.contract !== CONTRACT) throw new Error("SECRETARY_OFFICE_ARTIFACT_RECORD_INVALID");
  return {
    ...register,
    history: list(register.history),
    artifact_versions: list(register.artifact_versions),
  };
}

async function readTask(organization, artifactId) {
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", artifactId)
      .maybeSingle(),
  );
  if (!task || task.source !== SOURCE) throw new Error("SECRETARY_OFFICE_ARTIFACT_NOT_FOUND");
  return task;
}

function replayOrConflict(register, evidenceId, eventName, payloadHash) {
  const replay = register.history.find((entry) => entry.evidence_id === evidenceId);
  if (!replay) return null;
  if (replay.event !== eventName || replay.payload_sha256 !== payloadHash) throw new Error("SECRETARY_OFFICE_ARTIFACT_EVIDENCE_REUSE_CONFLICT");
  return replay;
}

async function sourceSnapshotFor({ organization, type, payload }) {
  if (type === "DOCUMENT") {
    return loadFinalDocumentPreparation(
      organization,
      payload.source_preparation_id || payload.sourcePreparationId,
      payload.source_preparation_version ?? payload.sourcePreparationVersion,
    );
  }
  return normalizeSpreadsheetSnapshot(payload);
}

export async function prepareSecretaryOfficeArtifact({ context, payload = {} } = {}) {
  const type = normalizeArtifactType(payload.artifact_type || payload.artifactType);
  const formats = normalizeFormats(type, payload.formats);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_OFFICE_ARTIFACT_EVIDENCE_REQUIRED");
  const preparedAt = iso(payload.prepared_at || payload.preparedAt, "prepared_at");
  const auth = await routingFor({ context, instruction: "Prepare an internal office artifact from an explicit frozen source without publishing, filing, sending, signing, or changing external systems.", at: preparedAt });
  const snapshot = await sourceSnapshotFor({ organization: auth.organization, type, payload });
  const versionRecord = artifactVersion({ version: 1, type, formats, snapshot, preparedAt, evidenceId });
  const payloadHash = sha256(JSON.stringify({ type, formats, source_snapshot_sha256: versionRecord.source_snapshot_sha256, evidenceId, preparedAt }));
  const artifactId = deterministicUuid(`avantiqo-secretary-office-artifact-v1:${auth.organization}:${evidenceId}`);
  const existing = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", auth.organization).eq("id", artifactId).maybeSingle());
  if (existing) {
    const register = registerFromTask(existing);
    const replay = replayOrConflict(register, evidenceId, "ARTIFACT_PREPARED", payloadHash);
    if (!replay) throw new Error("SECRETARY_OFFICE_ARTIFACT_EVIDENCE_REUSE_CONFLICT");
    return { status: "prepared", contract: CONTRACT, artifact: existing, record: register, replay_safe: true, ...safetyFlags() };
  }
  const register = {
    contract: CONTRACT,
    artifact_id: artifactId,
    state: "PREPARED",
    version: 1,
    artifact_type: type,
    formats,
    current_source_snapshot: snapshot,
    current_source_snapshot_sha256: versionRecord.source_snapshot_sha256,
    content_identity_sha256: versionRecord.content_identity_sha256,
    initial_render_manifest: versionRecord.initial_render_manifest,
    canonical_owner_party_id: auth.owner,
    operational_assignee_party_id: auth.operational,
    prepared_at: preparedAt,
    revised_at: null,
    cancelled_at: null,
    artifact_versions: [versionRecord],
    history: [{
      event: "ARTIFACT_PREPARED",
      evidence_id: evidenceId,
      occurred_at: preparedAt,
      recorded_by_party_id: auth.actor,
      version: 1,
      payload_sha256: payloadHash,
      source_snapshot_sha256: versionRecord.source_snapshot_sha256,
      content_identity_sha256: versionRecord.content_identity_sha256,
      ...safetyFlags(),
    }],
    ...safetyFlags(),
  };
  const task = await one(
    supabaseAdmin.from("secretary_tasks").insert({
      id: artifactId,
      organization_id: auth.organization,
      entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
      owner_party_id: auth.operational,
      contact_party_id: null,
      title: `Office artifact: ${snapshot.title}`,
      details: `${type} internal artifact preparation ledger`,
      status: "DONE",
      priority: "NORMAL",
      due_at: null,
      remind_at: null,
      completed_at: preparedAt,
      source: SOURCE,
      created_by_party_id: auth.actor,
      metadata: {
        [REGISTER_KEY]: register,
        secretary_office_artifact_contract: CONTRACT,
        secretary_office_artifact_state: "PREPARED",
        ledger_task_is_execution_work: false,
        ...secretaryAdministrativeCoverageMetadata(auth.routing),
        ...safetyFlags(),
      },
    }).select("*").single(),
  );
  return { status: "prepared", contract: CONTRACT, artifact: task, record: register, replay_safe: false, ...safetyFlags() };
}

export async function reviseSecretaryOfficeArtifact({ context, payload = {} } = {}) {
  const artifactId = text(payload.artifact_id || payload.artifactId, 120);
  if (!artifactId) throw new Error("SECRETARY_OFFICE_ARTIFACT_ID_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_OFFICE_ARTIFACT_EXPECTED_VERSION_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_OFFICE_ARTIFACT_EVIDENCE_REQUIRED");
  const revisedAt = iso(payload.revised_at || payload.revisedAt, "revised_at");
  const auth = await routingFor({ context, instruction: "Revise an internal office artifact from a new explicit source version while preserving artifact history.", at: revisedAt });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask(auth.organization, artifactId);
    const register = registerFromTask(task);
    if (!ACTIVE_STATES.has(register.state)) throw new Error(`SECRETARY_OFFICE_ARTIFACT_STATE_INVALID:${register.state}`);
    const type = normalizeArtifactType(payload.artifact_type || payload.artifactType || register.artifact_type);
    if (type !== register.artifact_type) throw new Error("SECRETARY_OFFICE_ARTIFACT_TYPE_CHANGE_FORBIDDEN");
    const formats = normalizeFormats(type, payload.formats);
    const snapshot = await sourceSnapshotFor({ organization: auth.organization, type, payload });
    const nextVersion = expectedVersion + 1;
    const versionRecord = artifactVersion({ version: nextVersion, type, formats, snapshot, preparedAt: revisedAt, evidenceId });
    const payloadHash = sha256(JSON.stringify({ type, formats, source_snapshot_sha256: versionRecord.source_snapshot_sha256, evidenceId, revisedAt }));
    const replay = replayOrConflict(register, evidenceId, "ARTIFACT_REVISED", payloadHash);
    if (replay) return { status: "revised", contract: CONTRACT, artifact: task, record: register, replay_safe: true, ...safetyFlags() };
    if (Number(register.version) !== expectedVersion) throw new Error("SECRETARY_OFFICE_ARTIFACT_STALE_VERSION");
    const next = {
      ...register,
      state: "PREPARED",
      version: nextVersion,
      formats,
      current_source_snapshot: snapshot,
      current_source_snapshot_sha256: versionRecord.source_snapshot_sha256,
      content_identity_sha256: versionRecord.content_identity_sha256,
      initial_render_manifest: versionRecord.initial_render_manifest,
      revised_at: revisedAt,
      artifact_versions: [...register.artifact_versions, versionRecord].slice(-25),
      history: [...register.history, {
        event: "ARTIFACT_REVISED",
        evidence_id: evidenceId,
        occurred_at: revisedAt,
        recorded_by_party_id: auth.actor,
        version: nextVersion,
        payload_sha256: payloadHash,
        source_snapshot_sha256: versionRecord.source_snapshot_sha256,
        content_identity_sha256: versionRecord.content_identity_sha256,
        ...safetyFlags(),
      }].slice(-500),
      ...safetyFlags(),
    };
    const updated = await supabaseAdmin.from("secretary_tasks")
      .update({
        title: `Office artifact: ${snapshot.title}`,
        metadata: {
          ...object(task.metadata),
          [REGISTER_KEY]: next,
          secretary_office_artifact_contract: CONTRACT,
          secretary_office_artifact_state: next.state,
          ...secretaryAdministrativeCoverageMetadata(auth.routing),
          ...safetyFlags(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", auth.organization)
      .eq("id", task.id)
      .eq("updated_at", task.updated_at)
      .select("*")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) continue;
    return { status: "revised", contract: CONTRACT, artifact: updated.data, record: next, replay_safe: false, ...safetyFlags() };
  }
  throw new Error("SECRETARY_OFFICE_ARTIFACT_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function renderSecretaryOfficeArtifact({ context, payload = {} } = {}) {
  const artifactId = text(payload.artifact_id || payload.artifactId, 120);
  if (!artifactId) throw new Error("SECRETARY_OFFICE_ARTIFACT_ID_REQUIRED");
  const organization = organizationId(context);
  actorPartyId(context);
  const task = await readTask(organization, artifactId);
  const register = registerFromTask(task);
  if (register.state !== "PREPARED") throw new Error(`SECRETARY_OFFICE_ARTIFACT_STATE_INVALID:${register.state}`);
  await routingFor({ context, instruction: "Render a previously prepared internal office artifact from its frozen source snapshot without sending, publishing, filing, or persisting it externally.", at: new Date().toISOString() });
  const requested = payload.formats ? normalizeFormats(register.artifact_type, payload.formats) : list(register.formats);
  for (const format of requested) {
    if (!register.formats.includes(format)) throw new Error(`SECRETARY_OFFICE_ARTIFACT_FORMAT_NOT_PREPARED:${format}`);
  }
  const files = renderFiles(register.artifact_type, requested, register.current_source_snapshot, true);
  return {
    status: "rendered",
    contract: CONTRACT,
    artifact: task,
    artifact_version: register.version,
    content_identity_sha256: register.content_identity_sha256,
    source_snapshot_sha256: register.current_source_snapshot_sha256,
    files,
    ...safetyFlags(),
  };
}

export async function cancelSecretaryOfficeArtifact({ context, payload = {} } = {}) {
  const artifactId = text(payload.artifact_id || payload.artifactId, 120);
  if (!artifactId) throw new Error("SECRETARY_OFFICE_ARTIFACT_ID_REQUIRED");
  const expectedVersion = Number(payload.expected_version ?? payload.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("SECRETARY_OFFICE_ARTIFACT_EXPECTED_VERSION_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_OFFICE_ARTIFACT_EVIDENCE_REQUIRED");
  const cancelledAt = iso(payload.cancelled_at || payload.cancelledAt, "cancelled_at");
  const reason = text(payload.reason, 2000);
  if (!reason) throw new Error("SECRETARY_OFFICE_ARTIFACT_CANCEL_REASON_REQUIRED");
  const auth = await routingFor({ context, instruction: "Cancel only the Secretary office-artifact tracking record; do not delete, unpublish, revoke, or alter external files.", at: cancelledAt });
  const payloadHash = sha256(JSON.stringify({ evidenceId, cancelledAt, reason }));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await readTask(auth.organization, artifactId);
    const register = registerFromTask(task);
    const replay = replayOrConflict(register, evidenceId, "ARTIFACT_TRACKING_CANCELLED", payloadHash);
    if (replay) return { status: "cancelled", contract: CONTRACT, artifact: task, record: register, replay_safe: true, ...safetyFlags() };
    if (register.state !== "PREPARED") throw new Error(`SECRETARY_OFFICE_ARTIFACT_STATE_INVALID:${register.state}`);
    if (Number(register.version) !== expectedVersion) throw new Error("SECRETARY_OFFICE_ARTIFACT_STALE_VERSION");
    const nextVersion = expectedVersion + 1;
    const next = {
      ...register,
      state: "CANCELLED",
      version: nextVersion,
      cancelled_at: cancelledAt,
      cancellation_reason: reason,
      history: [...register.history, {
        event: "ARTIFACT_TRACKING_CANCELLED",
        evidence_id: evidenceId,
        occurred_at: cancelledAt,
        recorded_by_party_id: auth.actor,
        version: nextVersion,
        payload_sha256: payloadHash,
        reason,
        ...safetyFlags(),
      }].slice(-500),
      ...safetyFlags(),
    };
    const updated = await supabaseAdmin.from("secretary_tasks")
      .update({
        status: "CANCELLED",
        completed_at: cancelledAt,
        metadata: {
          ...object(task.metadata),
          [REGISTER_KEY]: next,
          secretary_office_artifact_contract: CONTRACT,
          secretary_office_artifact_state: next.state,
          ...secretaryAdministrativeCoverageMetadata(auth.routing),
          ...safetyFlags(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", auth.organization)
      .eq("id", task.id)
      .eq("updated_at", task.updated_at)
      .select("*")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) continue;
    return { status: "cancelled", contract: CONTRACT, artifact: updated.data, record: next, replay_safe: false, ...safetyFlags() };
  }
  throw new Error("SECRETARY_OFFICE_ARTIFACT_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export async function readSecretaryOfficeArtifact({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const artifactId = text(payload.artifact_id || payload.artifactId, 120);
  if (!artifactId) throw new Error("SECRETARY_OFFICE_ARTIFACT_ID_REQUIRED");
  const task = await readTask(organization, artifactId);
  return { status: "completed", contract: CONTRACT, artifact: task, record: registerFromTask(task), ...safetyFlags() };
}

export async function listSecretaryOfficeArtifacts({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const includeCancelled = payload.include_cancelled === true || payload.includeCancelled === true;
  const limitValue = Number(payload.limit);
  const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(200, Math.floor(limitValue))) : 50;
  let query = supabaseAdmin.from("secretary_tasks")
    .select("*")
    .eq("organization_id", organization)
    .eq("source", SOURCE)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!includeCancelled) query = query.neq("status", "CANCELLED");
  const rows = await many(query);
  return {
    status: "completed",
    contract: CONTRACT,
    count: rows.length,
    artifacts: rows.map((artifact) => ({ artifact, record: registerFromTask(artifact) })),
    ...safetyFlags(),
  };
}

export const SECRETARY_OFFICE_ARTIFACT_PREPARATION_CONTRACT = CONTRACT;

export default {
  prepareSecretaryOfficeArtifact,
  reviseSecretaryOfficeArtifact,
  renderSecretaryOfficeArtifact,
  cancelSecretaryOfficeArtifact,
  readSecretaryOfficeArtifact,
  listSecretaryOfficeArtifacts,
};
