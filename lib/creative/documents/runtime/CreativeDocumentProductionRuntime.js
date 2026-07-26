import crypto from "node:crypto";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { creativeStorageUri } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import * as ProductionTaskRepository from "@/lib/operations/tasks/repositories/ProductionTaskRepository";
import {
  dependencyDocumentContent,
  documentContentSummary,
  normalizeDocumentContent,
  requestedDocumentFormats,
  unwrapDocumentOutput,
} from "./DocumentContentRuntime";
import { renderDocumentPdf } from "./DocumentPdfRuntime";
import { renderDocumentDocx, renderDocumentPptx } from "./DocumentOfficeRuntime";

const supabaseAdmin = getServiceSupabase();

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function safe(value, fallback = "document") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function mime(format) {
  return {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  }[format];
}

function render(format, document) {
  if (format === "pdf") return renderDocumentPdf(document);
  if (format === "docx") return renderDocumentDocx(document);
  if (format === "pptx") return renderDocumentPptx(document);
  throw new Error(`CREATIVE_DOCUMENT_FORMAT_UNSUPPORTED:${format}`);
}

function validateBuffer(format, buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error(`CREATIVE_DOCUMENT_${format.toUpperCase()}_EMPTY`);
  }
  if (format === "pdf" && !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("CREATIVE_DOCUMENT_PDF_SIGNATURE_INVALID");
  }
  if (["docx", "pptx"].includes(format)) {
    const valid = buffer.length > 22 && buffer.readUInt32LE(0) === 0x04034b50 &&
      buffer.includes(Buffer.from("[Content_Types].xml"));
    if (!valid) throw new Error(`CREATIVE_DOCUMENT_${format.toUpperCase()}_PACKAGE_INVALID`);
  }
}

async function upload({ task, format, buffer, identity }) {
  const bucket = task.input?.storage_policy?.bucket ||
    task.metadata?.storage_policy?.bucket ||
    process.env.CREATIVE_DOCUMENT_RENDER_BUCKET ||
    process.env.CREATIVE_MEDIA_RENDER_BUCKET ||
    null;
  if (!bucket) throw new Error("CREATIVE_DOCUMENT_STORAGE_BUCKET_REQUIRED");
  const storagePath = [
    safe(task.organization_id),
    safe(task.creative_project_id),
    "documents",
    safe(task.metadata?.deliverable_id || task.id),
    `${identity}.${format}`,
  ].join("/");
  const { error } = await supabaseAdmin.storage.from(bucket).upload(storagePath, buffer, {
    contentType: mime(format),
    upsert: false,
  });
  if (error && error.statusCode !== "409" && error.status !== 409) throw error;
  return {
    format,
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
    mime_type: mime(format),
    file_size_bytes: buffer.length,
    checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

async function projectTasks(task) {
  return ProductionTaskRepository.listByProject({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
}

export const CreativeDocumentProductionRuntime = {
  async render(task) {
    if (!task?.organization_id) throw new Error("organization_id required");
    if (!task?.creative_project_id) throw new Error("creative_project_id required");
    const tasks = await projectTasks(task);
    const source = dependencyDocumentContent(task, tasks);
    if (!source) throw new Error("CREATIVE_DOCUMENT_APPROVED_CONTENT_REQUIRED");
    const document = normalizeDocumentContent(source, task);
    const formats = requestedDocumentFormats(task);
    const identity = crypto.createHash("sha256").update(JSON.stringify({
      project_id: task.creative_project_id,
      deliverable_id: task.metadata?.deliverable_id || null,
      source,
      output_spec: task.input?.output_spec || {},
      formats,
    })).digest("hex");
    const files = [];
    for (const format of formats) {
      const buffer = render(format, document);
      validateBuffer(format, buffer);
      files.push(await upload({ task, format, buffer, identity }));
    }
    const primary = files.find((file) => file.format === "pdf") || files[0];
    return {
      type: "ASSET",
      name: `${document.title}.${primary.format}`,
      url: primary.url,
      file_url: primary.url,
      storage_path: primary.storage_path,
      mime_type: primary.mime_type,
      technical: {
        mime_type: primary.mime_type,
        checksum: primary.checksum,
        file_size_bytes: primary.file_size_bytes,
      },
      document_identity: identity,
      formats,
      files,
      content_summary: documentContentSummary(document),
    };
  },

  async validate(task) {
    if (!task?.organization_id) throw new Error("organization_id required");
    if (!task?.creative_project_id) throw new Error("creative_project_id required");
    const tasks = await projectTasks(task);
    const dependencies = new Set(list(task.depends_on));
    const rendered = tasks.find((candidate) => dependencies.has(candidate.id));
    const output = object(unwrapDocumentOutput(rendered?.output?.output || rendered?.output));
    const files = list(output.files);
    const requiredFormats = requestedDocumentFormats(rendered || task);
    const failures = [];
    if (!rendered || rendered.status !== "COMPLETED") failures.push("DOCUMENT_RENDER_TASK_NOT_COMPLETED");
    if (!output.url || !output.storage_path) failures.push("DOCUMENT_PRIMARY_ARTIFACT_REQUIRED");
    if (!files.length) failures.push("DOCUMENT_FILE_MANIFEST_REQUIRED");
    for (const format of requiredFormats) {
      const file = files.find((candidate) => candidate.format === format);
      if (!file) failures.push(`DOCUMENT_FORMAT_MISSING:${format}`);
      else {
        if (!file.url || !file.storage_path) failures.push(`DOCUMENT_STORAGE_EVIDENCE_MISSING:${format}`);
        if (Number(file.file_size_bytes || 0) <= 0) failures.push(`DOCUMENT_FILE_EMPTY:${format}`);
        if (!text(file.checksum)) failures.push(`DOCUMENT_CHECKSUM_MISSING:${format}`);
        if (file.mime_type !== mime(format)) failures.push(`DOCUMENT_MIME_INVALID:${format}`);
      }
    }
    const summary = object(output.content_summary);
    if (!text(summary.title)) failures.push("DOCUMENT_TITLE_REQUIRED");
    if (Number(summary.section_count || 0) < 1) failures.push("DOCUMENT_SECTION_REQUIRED");
    return {
      passed: failures.length === 0,
      verdict: failures.length === 0 ? "PASSED" : "FAILED",
      overall_score: failures.length === 0 ? 1 : 0,
      failed_checks: failures,
      repair_instructions: failures.map((failure) =>
        `Repair ${failure} and regenerate the document artifact.`,
      ),
      artifact: {
        url: output.url || null,
        storage_path: output.storage_path || null,
        formats: files.map((file) => file.format),
        files,
      },
      checks: {
        real_file_evidence: Boolean(output.url && output.storage_path),
        format_manifest_complete: requiredFormats.every((format) =>
          files.some((file) => file.format === format),
        ),
        checksums_present: files.length > 0 && files.every((file) => text(file.checksum)),
        non_empty_files: files.length > 0 && files.every((file) => Number(file.file_size_bytes) > 0),
      },
    };
  },
};
