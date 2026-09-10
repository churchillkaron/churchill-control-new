import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const ANALYSIS_SERVICE_ID = "ai.image.analyze";
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
  "Return one strict JSON object with: object_type, document_type, confidence, candidate_domains, key_fields, visible_text, parties, dates, amounts, currency, identifiers, asset_details, duplicate_hints, clarification_required, clarification_question.",
  "candidate_domains may include Finance, Supply Chain, People, Projects, Operations, Commercial, Documents, Creative, Administration, Compliance.",
  "Do not infer a business fact that is not visible. If classification is ambiguous, set clarification_required=true and provide one short business question.",
].join(" ");
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
    if (analysis.requires_content_analysis !== true) {
      analyzed.push(file);
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
