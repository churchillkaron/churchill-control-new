import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  analyzeBusinessPartnerVideoAttachment,
} from "@/lib/platform/runtime/BusinessPartnerVideoAttachmentAnalysisRuntime";

import {
  AVANTIQO_ATTACHMENT_ANALYSIS_VERSION,
} from "@/lib/platform/runtime/ConversationAttachmentAnalysisContract";
export { AVANTIQO_ATTACHMENT_ANALYSIS_VERSION };

const ANALYSIS_SERVICE_ID = "ai.image.analyze";
const TEXT_ANALYSIS_SERVICE_ID = "ai.text.generate";
const SPEECH_ANALYSIS_SERVICE_ID = "ai.speech.to.text";
const POLL_MS = 1500;
const MAX_WAIT_MS = 90_000;

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value : []; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function ownedVisionFile(file = {}) {
  const mime = text(file.mime_type, 160).toLowerCase();
  if (mime.startsWith("image/")) return true;
  return mime === "application/pdf" && object(file.analysis).analysis_adapter === "owned_document_vision";
}

const UNIVERSAL_VISUAL_ANALYSIS_INSTRUCTION = [
  "Analyze this user-uploaded file from visible evidence only.",
  "Return one strict JSON object with an objects array. Each object must contain: object_id, object_type, document_type, confidence, candidate_domains, key_fields, visible_text, parties, dates, amounts, currency, identifiers, asset_details, duplicate_hints, evidence_span, clarification_required, clarification_question. evidence_span should identify page(s), sheet/row range, or media time range when available.",
  "candidate_domains may include Finance, Supply Chain, People, Projects, Operations, Commercial, Documents, Creative, Administration, Compliance.",
  "For invoices and receipts, preserve visible supplier/customer identity, invoice_or_receipt_number, transaction_date, due_date, payment_status (PAID, UNPAID, UNKNOWN), payment_method, payment_reference, subtotal, tax_amount, total_amount, currency, and line_items when present. Never infer PAID merely because the document is called a receipt.",
  "For recipes or recipe cards, preserve dish_code/menu_item_code when visibly present and return ingredients/recipe_items with exact visible item_code or SKU, quantity, and unit/UOM. Never invent an inventory code from an ingredient name and never infer a unit that is not evidenced.",
  "Do not infer a business fact that is not visible. If classification is ambiguous, set clarification_required=true and provide one short business question.",
].join(" ");

const UNIVERSAL_TEXT_ANALYSIS_INSTRUCTION = [
  "Analyze only the extracted content supplied below; do not infer facts that are not present.",
  "Return one strict JSON object with an objects array. Each object must contain: object_id, object_type, document_type, confidence, candidate_domains, key_fields, parties, dates, amounts, currency, identifiers, asset_details, duplicate_hints, evidence_span, clarification_required, clarification_question. Split distinct business objects instead of merging them.",
  "candidate_domains may include Finance, Supply Chain, People, Projects, Operations, Commercial, Documents, Creative, Administration, Compliance.",
  "For invoices and receipts, preserve visible supplier/customer identity, invoice_or_receipt_number, transaction_date, due_date, payment_status (PAID, UNPAID, UNKNOWN), payment_method, payment_reference, subtotal, tax_amount, total_amount, currency, and line_items when present. Never infer PAID merely because the document is called a receipt.",
  "For recipes or recipe cards, preserve dish_code/menu_item_code when visibly present and return ingredients/recipe_items with exact visible item_code or SKU, quantity, and unit/UOM. Never invent an inventory code from an ingredient name and never infer a unit that is not evidenced.",
  "Classify the business meaning of the content, not the filename. If multiple destinations remain plausible, set clarification_required=true and ask one short business question.",
].join(" ");

function currentAnalysis(file = {}) {
  const analysis = object(file.analysis);
  return analysis.status === "ANALYZED" && analysis.analysis_version === AVANTIQO_ATTACHMENT_ANALYSIS_VERSION;
}

function extractedContentFile(file = {}) {
  const analysis = object(file.analysis);
  return ["TEXT_EXTRACTED", "STRUCTURE_EXTRACTED"].includes(text(analysis.status, 80)) && Boolean(text(analysis.content_excerpt, 120000));
}

function findText(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findText(item, depth + 1); if (found) return found; }
    return "";
  }
  if (typeof value !== "object") return "";
  for (const key of ["text", "output_text", "content", "message"]) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key];
  }
  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findText(value[key], depth + 1); if (found) return found;
  }
  return "";
}

function parseJson(value) {
  const source = text(value, 120000).replace(/^\uFEFF/, "");
  if (!source) return null;
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  const candidate = first >= 0 && last > first ? source.slice(first, last + 1) : source;
  try { const parsed = JSON.parse(candidate); return object(parsed); } catch { return null; }
}
async function settleUntilComplete(initial, context = {}) {
  if (!initial?.pending) return initial;
  const deadline = Date.now() + MAX_WAIT_MS;
  let current = initial;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    current = await settlePendingService({
      organization_id: context.organizationId,
      provider: current.provider,
      provider_job_id: current.provider_job_id || current.output?.provider_job_id,
      usage_id: current.usage?.id,
      pricing: current.pricing || {},
      credential_id: current.credential_id || null,
      started_at: current.started_at || null,
      provider_status_input: { model: current.model || null },
      metadata: { module: "OPERATOR", operation: "CONVERSATION_ATTACHMENT_ANALYSIS_POLL" },
    });
    if (!current?.pending) return current;
  }
  throw new Error("ATTACHMENT_ANALYSIS_TIMEOUT");
}

function analysisEvidence(result = {}) {
  const output = object(result.output);
  return object(output.result || output.output?.result || output.result?.result || result.result);
}

async function analyzeExtractedAttachment({ file, context }) {
  const prior = object(file.analysis);
  const excerpt = text(prior.content_excerpt, 60000);
  const result = await executeService({
    organization_id: context.organizationId,
    party_id: context.partyId || null,
    entity_id: context.entityId || null,
    service_id: TEXT_ANALYSIS_SERVICE_ID,
    capability: "ai.text.generate",
    input: {
      prompt: `${UNIVERSAL_TEXT_ANALYSIS_INSTRUCTION}\n\nEXTRACTED CONTENT:\n${excerpt}`,
      max_output_tokens: 1400,
      response_format: { type: "json_object" },
    },
    category: "BUSINESS_PARTNER_ATTACHMENT_ANALYSIS",
    provider_policy: {
      owned_only_required: true,
      external_provider_fallback_allowed: false,
    },
    metadata: {
      module: "OPERATOR",
      operation: "CONVERSATION_ATTACHMENT_TEXT_ANALYSIS",
      attachment_name: file.name,
      attachment_sha256: file.sha256,
      authorization_effect: "NONE",
    },
  });
  const settled = await settleUntilComplete(result, context);
  if (settled?.failed) throw new Error(settled.error || "ATTACHMENT_TEXT_ANALYSIS_FAILED");
  const evidence = parseJson(findText(settled));
  if (!evidence || !Object.keys(evidence).length) throw new Error("ATTACHMENT_TEXT_ANALYSIS_JSON_REQUIRED");
  return {
    ...file,
    analysis: {
      ...prior,
      status: "ANALYZED",
      analysis_version: AVANTIQO_ATTACHMENT_ANALYSIS_VERSION,
      confidence: Number(evidence.confidence) || 0,
      candidate_domains: list(evidence.candidate_domains),
      evidence,
      content_excerpt: prior.content_excerpt || null,
      requires_content_analysis: false,
      clarification_required: evidence.clarification_required === true,
      clarification_question: text(evidence.clarification_question, 700) || null,
      provider: "avantiqo-intelligence",
      capability: "ai.text.generate",
      authorization_effect: "NONE",
    },
  };
}

function audioAttachment(file = {}) {
  return text(file.mime_type, 160).toLowerCase().startsWith("audio/");
}
function videoAttachment(file = {}) {
  return text(file.mime_type, 160).toLowerCase().startsWith("video/");
}

async function signedAttachmentFile(file = {}) {
  const response = await fetch(file.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`ATTACHMENT_SIGNED_DOWNLOAD_FAILED:${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("ATTACHMENT_AUDIO_EMPTY");
  return {
    name: text(file.name, 240) || "audio.bin",
    type: text(file.mime_type, 160) || "application/octet-stream",
    size: bytes.length,
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
  };
}

async function analyzeAudioAttachment({ file, context }) {
  const upload = await signedAttachmentFile(file);
  const transcribed = await executeService({
    organization_id: context.organizationId,
    party_id: context.partyId || null,
    entity_id: context.entityId || null,
    service_id: SPEECH_ANALYSIS_SERVICE_ID,
    capability: "ai.speech.to.text",
    input: { file: upload, file_name: upload.name, mime_type: upload.type, quantity: 1 },
    category: "BUSINESS_PARTNER_ATTACHMENT_ANALYSIS",
    provider_policy: { owned_only_required: true, external_provider_fallback_allowed: false },
    metadata: {
      module: "OPERATOR", operation: "CONVERSATION_ATTACHMENT_AUDIO_TRANSCRIPTION",
      attachment_name: file.name, attachment_sha256: file.sha256, authorization_effect: "NONE",
    },
  });
  const settled = await settleUntilComplete(transcribed, context);
  if (settled?.failed) throw new Error(settled.error || "ATTACHMENT_AUDIO_TRANSCRIPTION_FAILED");
  const transcript = text(findText(settled), 120000);
  if (!transcript) throw new Error("ATTACHMENT_AUDIO_TRANSCRIPT_REQUIRED");
  return analyzeExtractedAttachment({
    file: {
      ...file,
      analysis: {
        ...object(file.analysis), status: "TEXT_EXTRACTED", content_excerpt: transcript,
        requires_content_analysis: false, candidate_domains: [], structured_file_type: "audio_transcript",
        transcription_provider: "avantiqo-voice", transcription_capability: "ai.speech.to.text",
        authorization_effect: "NONE",
      },
    },
    context,
  });
}

async function analyzeImageAttachment({ file, context }) {
  const result = await executeService({
    organization_id: context.organizationId,
    party_id: context.partyId || null,
    entity_id: context.entityId || null,
    service_id: ANALYSIS_SERVICE_ID,
    capability: "ai.image.analyze",
    input: {
      capability: "ai.image.analyze",
      instruction: UNIVERSAL_VISUAL_ANALYSIS_INSTRUCTION,
      source_assets: [file.url],
      source_asset_roles: { source_image: file.url },
      quantity: 1,
    },
    category: "BUSINESS_PARTNER_ATTACHMENT_ANALYSIS",
    provider_policy: {
      owned_only_required: true,
      external_provider_fallback_allowed: false,
    },
    metadata: {
      module: "OPERATOR",
      operation: "CONVERSATION_ATTACHMENT_ANALYSIS",
      attachment_name: file.name,
      attachment_sha256: file.sha256,
      authorization_effect: "NONE",
    },
  });
  const settled = await settleUntilComplete(result, context);
  if (settled?.failed) throw new Error(settled.error || "ATTACHMENT_ANALYSIS_FAILED");
  const evidence = analysisEvidence(settled);
  return {
    ...file,
    analysis: {
      status: "ANALYZED",
      analysis_version: AVANTIQO_ATTACHMENT_ANALYSIS_VERSION,
      confidence: Number(evidence.confidence) || 0,
      candidate_domains: list(evidence.candidate_domains),
      evidence,
      requires_content_analysis: false,
      clarification_required: evidence.clarification_required === true,
      clarification_question: text(evidence.clarification_question, 700) || null,
      provider: "avantiqo-image",
      capability: "ai.image.analyze",
      authorization_effect: "NONE",
    },
  };
}
export async function analyzeConversationAttachments({ files = [], context = {} } = {}) {
  const analyzed = [];
  for (const file of list(files)) {
    const analysis = object(file.analysis);
    if (currentAnalysis(file)) { analyzed.push(file); continue; }
    const staleAnalyzed = text(analysis.status, 80) === "ANALYZED";
    const preservedExtractedContent = Boolean(text(analysis.content_excerpt, 120000));
    if (staleAnalyzed && preservedExtractedContent) {
      try {
        analyzed.push(await analyzeExtractedAttachment({ file, context }));
      } catch (error) {
        analyzed.push({ ...file, analysis: { ...analysis, status: "SEMANTIC_ANALYSIS_UNAVAILABLE", error: text(error?.message || error, 700), authorization_effect: "NONE" } });
      }
      continue;
    }
    if (!staleAnalyzed && analysis.requires_content_analysis !== true) {
      if (extractedContentFile(file)) {
        try {
          analyzed.push(await analyzeExtractedAttachment({ file, context }));
        } catch (error) {
          analyzed.push({
            ...file,
            analysis: {
              ...analysis,
              status: "SEMANTIC_ANALYSIS_UNAVAILABLE",
              error: text(error?.message || error, 700),
              authorization_effect: "NONE",
            },
          });
        }
      } else {
        analyzed.push(file);
      }
      continue;
    }
    if (audioAttachment(file)) {
      try {
        analyzed.push(await analyzeAudioAttachment({ file, context }));
      } catch (error) {
        analyzed.push({ ...file, analysis: { ...analysis, status: "ANALYSIS_UNAVAILABLE", error: text(error?.message || error, 700), clarification_required: false, authorization_effect: "NONE" } });
      }
      continue;
    }
    if (videoAttachment(file)) {
      try {
        analyzed.push(await analyzeBusinessPartnerVideoAttachment({ file, context }));
      } catch (error) {
        analyzed.push({ ...file, analysis: { ...analysis, status: "ANALYSIS_UNAVAILABLE", error: text(error?.message || error, 700), clarification_required: false, authorization_effect: "NONE" } });
      }
      continue;
    }
    if (!ownedVisionFile(file)) {
      analyzed.push({
        ...file,
        analysis: {
          ...analysis,
          status: "ANALYSIS_ADAPTER_REQUIRED",
          clarification_required: false,
          authorization_effect: "NONE",
        },
      });
      continue;
    }
    try {
      analyzed.push(await analyzeImageAttachment({ file, context }));
    } catch (error) {
      analyzed.push({
        ...file,
        analysis: {
          ...analysis,
          status: "ANALYSIS_UNAVAILABLE",
          error: text(error?.message || error, 700),
          clarification_required: false,
          authorization_effect: "NONE",
        },
      });
    }
  }
  return analyzed;
}

export default analyzeConversationAttachments;
