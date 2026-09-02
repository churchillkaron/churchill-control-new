import { mkdir, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ModalClient } from "modal";

const CONTRACT = "AVANTIQO_IMAGE_MODAL_DIRECT_SERVICE_CERTIFICATION_V1";
const BOOTSTRAP_CONTRACT = "AVANTIQO_IMAGE_CERTIFICATION_ISOLATION_V1";
const ORGANIZATION_NAME = "Avantiqo Image Certification";
const PROVIDER = "avantiqo-image";
const CAPABILITY = "ai.image.generate";
const MODAL_APP = "avantiqo-image-owned";
const MODAL_FUNCTION = "generate";
const JOB_PREFIX = "modal-image-direct:";
const FOUNDATION_MODEL = "Tongyi-MAI/Z-Image";
const PRODUCT_MODEL = "avantiqo-image-v1";
const CURRENCY = "THB";
const TOPUP_AMOUNT = 5;
const TOPUP_KEY = "TOPUP:avantiqo-image-modal-direct-certification-v1";
const TOPUP_REFERENCE = "avantiqo-image-modal-direct-certification-v1";
const MAX_PROJECTED_CUSTOMER_CHARGE_THB = 2;
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 240;
const DRAIN_POLLS = 30;
const OUTPUT_DIR = resolve("local-audit-output/avantiqo-image-modal-direct-certification");
const REPORT_PATH = resolve(OUTPUT_DIR, "report.json");
const IMAGE_PATH = resolve(OUTPUT_DIR, "certified-image.png");
const PROMPT = [
  "Create a photorealistic luxury product photograph of a real, recognizable perfume bottle.",
  "The bottle is rectangular black smoked glass with precise beveled edges, realistic transparent glass thickness visible around the perimeter, and a heavy brushed-gold metal cap with clean manufactured geometry.",
  "Place the bottle upright on polished black marble with a restrained natural reflection directly beneath it.",
  "Use a professional dark studio lighting setup: warm soft key light from the upper left, narrow controlled rim light from behind, realistic shadows, natural falloff, and physically plausible reflections on the glass, metal, and marble.",
  "Camera is at product level using an 85mm commercial product-photography lens, shallow depth of field, with sharp focus on the front beveled edge and cap.",
  "Background is deep charcoal with a smooth subtle gradient and no visible set edges.",
  "The result must look like a real high-end advertising photograph captured with a physical camera, not CGI and not an abstract sculpture.",
  "No text, no logo, no label, no extra objects, no duplicate bottle, no warped geometry, no melted glass, no impossible reflections.",
].join(" ");

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function upper(value) { return text(value, 120).toUpperCase(); }
function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function sleep(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }
function findValue(root, keys, seen = new Set()) {
  if (!root || typeof root !== "object" || seen.has(root)) return null;
  seen.add(root);
  for (const key of keys) { const value = root[key]; if (value !== undefined && value !== null && value !== "") return value; }
  for (const child of Array.isArray(root) ? root : Object.values(root)) { const found = findValue(child, keys, seen); if (found !== null) return found; }
  return null;
}
function pngDimensions(bytes) {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`${CONTRACT}_PNG_SIGNATURE_INVALID`);
  if (buffer.subarray(12, 16).toString("ascii") !== "IHDR") throw new Error(`${CONTRACT}_PNG_IHDR_REQUIRED`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
async function saveJson(value) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

if (text(process.env.NODE_ENV).toLowerCase() !== "development") throw new Error(`${CONTRACT}_DEVELOPMENT_ENV_REQUIRED`);
if (upper(process.env.AVANTIQO_IMAGE_MODAL_DIRECT_REAL_INFERENCE_APPROVED) !== "YES") throw new Error(`${CONTRACT}_REAL_INFERENCE_APPROVAL_REQUIRED`);
const sourceMain = text(process.env.AVANTIQO_IMAGE_MODAL_DIRECT_CERT_SOURCE_MAIN_COMMIT, 160).toLowerCase();
if (!/^[a-f0-9]{40}$/.test(sourceMain)) throw new Error(`${CONTRACT}_PINNED_MAIN_REQUIRED`);

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));
const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { resolveProvider } = await import("@/lib/platform/service-runtime/providers/ProviderResolver");
const { PricingRuntime } = await import("@/lib/platform/service-runtime/pricing/PricingRuntime");
const { WalletRepository } = await import("@/lib/platform/service-runtime/wallet/repositories/WalletRepository");
const { executeService, settlePendingService } = await import("@/lib/platform/service-runtime/execution/ServiceExecutionRuntime");

const pricingRows = await supabaseAdmin.from("provider_pricing").select("id,provider,capability,currency,unit,cost_per_unit,markup_percent,active,metadata").eq("provider", PROVIDER).eq("capability", CAPABILITY);
if (pricingRows.error) throw pricingRows.error;
if ((pricingRows.data || []).length !== 1) throw new Error(`${CONTRACT}_EXACT_PRICING_ROW_REQUIRED:${pricingRows.data?.length || 0}`);
const pricingRow = pricingRows.data[0];
if (pricingRow.active !== false || upper(pricingRow.metadata?.pricing_status) !== "MARKET_PARITY_READY" || pricingRow.metadata?.owned_inference !== true || pricingRow.metadata?.runtime_compatible !== true || pricingRow.metadata?.model_license_verified !== true || pricingRow.metadata?.production_routing_allowed !== false) {
  throw new Error(`${CONTRACT}_SAFE_PREPRODUCTION_PRICING_REQUIRED`);
}

const organizationLookup = await supabaseAdmin.from("organizations").select("id,name,organization_type,status,organization_status").eq("name", ORGANIZATION_NAME);
if (organizationLookup.error) throw organizationLookup.error;
if ((organizationLookup.data || []).length > 1) throw new Error(`${CONTRACT}_CERTIFICATION_ORGANIZATION_AMBIGUOUS`);
let organization = organizationLookup.data?.[0] || null;
if (!organization) {
  const created = await supabaseAdmin.from("organizations").insert({ name: ORGANIZATION_NAME, legal_name: ORGANIZATION_NAME, organization_type: "direct_business", status: "active", organization_status: "ACTIVE", industry: "software_certification", country: "TH" }).select("id,name,organization_type,status,organization_status").single();
  if (created.error) throw created.error;
  organization = created.data;
}
if (organization.organization_type !== "direct_business") throw new Error(`${CONTRACT}_CERTIFICATION_ORGANIZATION_TYPE_INVALID`);
const organizationId = organization.id;

const existingUsage = await supabaseAdmin.from("platform_service_usage").select("id,status,execution_status,provider_request_id,created_at").eq("organization_id", organizationId).eq("provider", PROVIDER).eq("capability", CAPABILITY).contains("metadata", { certification_contract: CONTRACT }).order("created_at", { ascending: false }).limit(3);
if (existingUsage.error) throw existingUsage.error;
if ((existingUsage.data || []).length > 0) throw new Error(`${CONTRACT}_EXISTING_USAGE_NO_NEW_SUBMISSION`);

const stagedService = await supabaseAdmin.from("organization_services").upsert({
  organization_id: organizationId,
  service_category_id: "platform-ai",
  service_id: CAPABILITY,
  status: "ACTIVE",
  managed_by: "AVANTIQO_CERTIFICATION",
  authorization_required: false,
  usage_enabled: false,
  billing_enabled: false,
  default_provider_id: PROVIDER,
  fallback_enabled: false,
  billing_mode: "wallet",
  pricing_mode: "provider",
  default_currency: CURRENCY,
  metadata: { certification_only: true, certification_contract: BOOTSTRAP_CONTRACT, production_routing_allowed: false },
  configuration: { certification_only: true, direct_modal_required: true, modal_gateway_forbidden: true, runpod_forbidden: true },
}, { onConflict: "organization_id,service_id" }).select("id,organization_id,service_id,status,managed_by,usage_enabled,billing_enabled,default_provider_id,fallback_enabled,metadata").single();
if (stagedService.error) throw stagedService.error;
if (stagedService.data.usage_enabled !== false || stagedService.data.billing_enabled !== false || stagedService.data.managed_by !== "AVANTIQO_CERTIFICATION") throw new Error(`${CONTRACT}_CERTIFICATION_SERVICE_STAGE_INVALID`);

const ensure = await supabaseAdmin.rpc("apply_wallet_transaction", { p_organization_id: organizationId, p_operation: "ENSURE", p_amount: 0, p_currency: CURRENCY, p_provider: PROVIDER, p_usage_id: null, p_invoice_id: null, p_reference: null, p_idempotency_key: null, p_metadata: { certification_only: true, certification_contract: BOOTSTRAP_CONTRACT } });
if (ensure.error) throw ensure.error;
const topup = await supabaseAdmin.rpc("apply_wallet_transaction", { p_organization_id: organizationId, p_operation: "TOPUP", p_amount: TOPUP_AMOUNT, p_currency: CURRENCY, p_provider: PROVIDER, p_usage_id: null, p_invoice_id: null, p_reference: TOPUP_REFERENCE, p_idempotency_key: TOPUP_KEY, p_metadata: { certification_only: true, certification_contract: BOOTSTRAP_CONTRACT } });
if (topup.error) throw topup.error;
const walletBefore = await WalletRepository.getByOrganization(organizationId);
if (!walletBefore?.id || upper(walletBefore.status) !== "ACTIVE" || upper(walletBefore.billing_policy) !== "PREPAID" || finite(walletBefore.reserved_balance) !== 0) throw new Error(`${CONTRACT}_CLEAN_PREPAID_CERTIFICATION_WALLET_REQUIRED`);

const policy = Object.freeze({ execution_scope: "BENCHMARK_REVIEW_PREVIEW", benchmark_only: true, allowed_providers: [PROVIDER], blocked_providers: [], owned_only_required: true, external_fallback_allowed: false, allow_owned_reasoning_fallback: false, allow_owned_lane_recovery: false });
const selected = await resolveProvider({ organization_id: organizationId, capability: CAPABILITY, preferredProvider: PROVIDER, policy });
if (selected?.provider !== PROVIDER || selected?.metadata?.benchmark_review_preview !== true) throw new Error(`${CONTRACT}_OWNED_BENCHMARK_PROVIDER_REQUIRED`);
const pricing = selected.pricing_record;
if (!pricing || pricing.active !== false || pricing.benchmark_review_preview_authorized !== true) throw new Error(`${CONTRACT}_BENCHMARK_PREVIEW_PRICING_REQUIRED`);
const preview = PricingRuntime.resolveRecord({ pricing, provider: PROVIDER, capability: CAPABILITY, currency: selected.currency, usage: { quantity: 1 } });
if (finite(preview.customer_price) <= 0 || finite(preview.customer_price) > MAX_PROJECTED_CUSTOMER_CHARGE_THB || finite(walletBefore.available_balance) < finite(preview.customer_price)) throw new Error(`${CONTRACT}_PROJECTED_CHARGE_INVALID:${preview.customer_price}`);

const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID, 500);
const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET, 1000);
if (!tokenId || !tokenSecret) throw new Error(`${CONTRACT}_MODAL_CREDENTIALS_REQUIRED`);
const modalEnvironment = text(process.env.AVANTIQO_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT, 120);
const modal = new ModalClient({ tokenId, tokenSecret });
const worker = await modal.functions.fromName(MODAL_APP, MODAL_FUNCTION, modalEnvironment ? { environment: modalEnvironment } : {});
async function stats() { const value = await worker.getCurrentStats(); return { backlog: finite(value?.backlog), runners: finite(value?.numTotalRunners) }; }
async function requireIdle() { const value = await stats(); if (value.backlog !== 0 || value.runners !== 0) throw new Error(`${CONTRACT}_DUPLICATE_GPU_GUARD_ACTIVE:${value.backlog}/${value.runners}`); return value; }
async function waitForDrain() { for (let attempt = 1; attempt <= DRAIN_POLLS; attempt += 1) { const value = await stats(); if (value.backlog === 0 && value.runners === 0) return value; if (attempt < DRAIN_POLLS) await sleep(2_000); } throw new Error(`${CONTRACT}_SCALE_TO_ZERO_DRAIN_TIMEOUT`); }

let serviceEnabled = false;
let certificationSucceeded = false;
try {
  const preStats = await requireIdle();
  const enabledService = await supabaseAdmin.from("organization_services").update({ usage_enabled: true, billing_enabled: true }).eq("organization_id", organizationId).eq("service_id", CAPABILITY).eq("managed_by", "AVANTIQO_CERTIFICATION").select("id,usage_enabled,billing_enabled").single();
  if (enabledService.error) throw enabledService.error;
  if (enabledService.data.usage_enabled !== true || enabledService.data.billing_enabled !== true) throw new Error(`${CONTRACT}_CERTIFICATION_SERVICE_ENABLE_FAILED`);
  serviceEnabled = true;

  const execution = await executeService({
    organization_id: organizationId,
    service_id: CAPABILITY,
    provider_id: PROVIDER,
    capability: CAPABILITY,
    input: { capability: CAPABILITY, input: PROMPT, model: PRODUCT_MODEL, quantity: 1, output_spec: { width: 1024, height: 1024, aspect_ratio: "1:1" }, provider_parameters: { seed: 51000, inference_steps: 28, guidance_scale: 4.0 } },
    metadata: { certification_contract: CONTRACT, certification_scope: "ISOLATED_OWNED_IMAGE_DIRECT_MODAL_GENERATE", provider_spend_approved: true, direct_modal_required: true, modal_gateway_forbidden: true, runpod_forbidden: true, single_job_only: true, certification_only_organization: true, production_activation_allowed: false, pricing_activation_allowed: false, production_deploy_performed: false, source_main_commit: sourceMain },
    category: "CERTIFICATION",
    provider_policy: policy,
  });
  if (execution?.provider !== PROVIDER || execution?.pending !== true) throw new Error(`${CONTRACT}_ASYNC_PENDING_EXECUTION_REQUIRED`);
  const providerJobId = text(execution.provider_job_id, 500);
  const usageId = text(execution?.usage?.id, 200);
  if (!providerJobId.startsWith(JOB_PREFIX) || !usageId) throw new Error(`${CONTRACT}_DIRECT_MODAL_BINDING_INVALID`);
  console.log(JSON.stringify({ contract: CONTRACT, phase: "SUBMITTED", usage_id: usageId, provider_job_id: providerJobId, provider_jobs_submitted_this_run: 1, projected_customer_price_thb: finite(preview.customer_price), pre_modal_stats: preStats }));

  let settled = null;
  for (let poll = 1; poll <= MAX_POLLS; poll += 1) {
    settled = await settlePendingService({ organization_id: organizationId, provider: PROVIDER, provider_job_id: providerJobId, usage_id: usageId, pricing: execution.pricing || {}, quantity: 1, unit: "image", metadata: { certification_contract: CONTRACT, direct_modal_required: true, modal_gateway_forbidden: true, runpod_forbidden: true, certification_only_organization: true }, provider_status_input: { capability: CAPABILITY }, credential_id: execution.credential_id || null, started_at: execution.started_at || null });
    if (settled?.pending !== true) break;
    if (poll < MAX_POLLS) await sleep(POLL_INTERVAL_MS);
  }
  if (!settled || settled.pending === true) throw new Error(`${CONTRACT}_POLL_TIMEOUT_RESUME_SAME_JOB_REQUIRED`);
  if (settled.failed === true || settled.success !== true) throw new Error(`${CONTRACT}_IMAGE_FAILED:${text(settled.error, 1000)}`);

  const storageReference = text(findValue(settled, ["storage_reference"]), 2000);
  const expectedReference = `storage://creative-assets/${organizationId}/generated/avantiqo-image/${usageId}.png`;
  if (storageReference !== expectedReference) throw new Error(`${CONTRACT}_PRIVATE_STORAGE_REFERENCE_INVALID:${storageReference}`);
  const storagePath = storageReference.slice("storage://creative-assets/".length);
  const stored = await supabaseAdmin.storage.from("creative-assets").download(storagePath);
  if (stored.error) throw stored.error;
  const imageBytes = Buffer.from(await stored.data.arrayBuffer());
  if (imageBytes.length < 1024) throw new Error(`${CONTRACT}_IMAGE_BYTES_INVALID`);
  const dimensions = pngDimensions(imageBytes);
  if (dimensions.width !== 1024 || dimensions.height !== 1024) throw new Error(`${CONTRACT}_IMAGE_DIMENSIONS_INVALID:${dimensions.width}x${dimensions.height}`);
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(IMAGE_PATH, imageBytes, { mode: 0o600 });

  const observedFoundation = text(findValue(settled, ["foundation_model"]), 200);
  const observedTransport = text(findValue(settled, ["modal_transport"]), 200);
  if (observedFoundation !== FOUNDATION_MODEL) throw new Error(`${CONTRACT}_FOUNDATION_MODEL_INVALID:${observedFoundation}`);
  if (observedTransport !== "modal-js-sdk-function-call-v1") throw new Error(`${CONTRACT}_DIRECT_MODAL_TRANSPORT_INVALID:${observedTransport}`);
  if (findValue(settled, ["modal_gateway_used"]) !== false) throw new Error(`${CONTRACT}_MODAL_GATEWAY_FORBIDDEN`);
  if (findValue(settled, ["runpod_inference_performed"]) === true) throw new Error(`${CONTRACT}_RUNPOD_FORBIDDEN`);
  if (findValue(settled, ["raw_reasoning_persisted"]) !== false) throw new Error(`${CONTRACT}_REASONING_BOUNDARY_INVALID`);
  const finalStats = await waitForDrain();

  const usageResult = await supabaseAdmin.from("platform_service_usage").select("id,status,execution_status,provider_request_id,quantity,unit,supplier_cost,customer_price,charged_amount,metadata").eq("id", usageId).maybeSingle();
  if (usageResult.error) throw usageResult.error;
  const usage = usageResult.data;
  if (!usage || upper(usage.status) !== "SUCCESS" || upper(usage.execution_status) !== "SUCCESS" || text(usage.provider_request_id) !== providerJobId || text(usage.unit).toLowerCase() !== "image" || finite(usage.quantity) !== 1) throw new Error(`${CONTRACT}_USAGE_SETTLEMENT_INVALID`);
  if (finite(usage.charged_amount) <= 0 || finite(usage.charged_amount) > MAX_PROJECTED_CUSTOMER_CHARGE_THB) throw new Error(`${CONTRACT}_CHARGE_INVALID:${usage.charged_amount}`);

  const report = {
    success: true,
    contract: CONTRACT,
    isolation_contract: BOOTSTRAP_CONTRACT,
    source_main_commit: sourceMain,
    certification_organization_id: organizationId,
    certification_organization_name: ORGANIZATION_NAME,
    customer_organization_mutated: false,
    provider: PROVIDER,
    capability: CAPABILITY,
    product_model: PRODUCT_MODEL,
    foundation_model: observedFoundation,
    modal_app: MODAL_APP,
    modal_function: MODAL_FUNCTION,
    modal_transport: observedTransport,
    modal_gateway_used: false,
    runpod_used: false,
    provider_jobs_submitted_this_run: 1,
    usage_id: usageId,
    provider_job_id: providerJobId,
    storage_reference: storageReference,
    private_org_scoped_storage: true,
    png_bytes: imageBytes.length,
    width: dimensions.width,
    height: dimensions.height,
    generation_seconds: finite(findValue(settled, ["generation_seconds"])),
    modal_elapsed_seconds: finite(findValue(settled, ["modal_elapsed_seconds"])),
    pricing: { unit: usage.unit, quantity: finite(usage.quantity), supplier_cost: finite(usage.supplier_cost), customer_price: finite(usage.customer_price), charged_amount: finite(usage.charged_amount), production_pricing_active: false, production_routing_allowed: false, economics_certified_in_database: false },
    scale_to_zero_observed: true,
    pre_modal_stats: preStats,
    final_modal_stats: finalStats,
    raw_reasoning_persisted: false,
    production_vercel_deploy_performed: false,
    pricing_activation_performed: false,
    production_routing_activation_performed: false,
    finished_at: new Date().toISOString(),
  };
  await saveJson(report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`${CONTRACT}=PASS`);
  certificationSucceeded = true;
} finally {
  if (serviceEnabled || organizationId) {
    const disabled = await supabaseAdmin.from("organization_services").update({ usage_enabled: false, billing_enabled: false }).eq("organization_id", organizationId).eq("service_id", CAPABILITY).eq("managed_by", "AVANTIQO_CERTIFICATION").select("id,usage_enabled,billing_enabled").maybeSingle();
    if (disabled.error) {
      console.error(`${CONTRACT}_SERVICE_DISABLE_FAILED:${disabled.error.message}`);
      if (certificationSucceeded) throw disabled.error;
    } else if (disabled.data && (disabled.data.usage_enabled !== false || disabled.data.billing_enabled !== false)) {
      const error = new Error(`${CONTRACT}_SERVICE_DISABLE_NOT_VERIFIED`);
      if (certificationSucceeded) throw error;
      console.error(error.message);
    }
  }
  modal.close();
}
