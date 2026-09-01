import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { ModalClient } from "modal";

const CONTRACT = "AVANTIQO_VOICE_MODAL_DIRECT_PREFLIGHT_V1";
const PROVIDER = "avantiqo-voice";
const MODAL_APP = "avantiqo-voice-owned";
const FUNCTIONS = Object.freeze([
  { capability: "ai.speech.to.text", name: "transcribe" },
  { capability: "ai.text.to.speech", name: "speak" },
]);
const CANONICAL_ORGANIZATION_NAME = "Avantiqo Platform";
const CANONICAL_ORGANIZATION_TYPE = "enterprise_group";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function upper(value) {
  return text(value, 120).toUpperCase();
}
function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function requireSourcePin() {
  const expected = text(process.env.AVANTIQO_VOICE_MODAL_PREFLIGHT_EXPECTED_MAIN_COMMIT, 160).toLowerCase();
  const source = text(process.env.AVANTIQO_VOICE_MODAL_PREFLIGHT_SOURCE_MAIN_COMMIT, 160).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expected) || source !== expected) {
    throw new Error(`${CONTRACT}_PINNED_ORIGIN_MAIN_REQUIRED`);
  }
  return expected;
}

const sourceMain = requireSourcePin();
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");

const organizationResult = await supabaseAdmin
  .from("organizations")
  .select("id,name,organization_type,status,organization_status")
  .eq("name", CANONICAL_ORGANIZATION_NAME)
  .eq("organization_type", CANONICAL_ORGANIZATION_TYPE)
  .eq("status", "active")
  .eq("organization_status", "ACTIVE")
  .limit(3);
if (organizationResult.error) throw organizationResult.error;
const organizations = list(organizationResult.data);
if (organizations.length !== 1 || !organizations[0]?.id) {
  throw new Error(`${CONTRACT}_PLATFORM_ORGANIZATION_RESOLUTION_FAILED:${organizations.length}`);
}
const organizationId = text(organizations[0].id, 200);

const supplierResult = await supabaseAdmin
  .from("provider_supplier_billing_accounts")
  .select("provider_id,status,verification_status,verification_method,supplier_party_id,configuration,metadata")
  .eq("provider_id", PROVIDER)
  .limit(2);
if (supplierResult.error) throw supplierResult.error;
const supplierRows = list(supplierResult.data);
if (supplierRows.length !== 1) throw new Error(`${CONTRACT}_SUPPLIER_ACCOUNT_RESOLUTION_FAILED:${supplierRows.length}`);
const supplier = supplierRows[0];
if (upper(supplier.status) !== "ACTIVE") throw new Error(`${CONTRACT}_SUPPLIER_ACCOUNT_NOT_ACTIVE`);
if (upper(supplier.verification_status) !== "VERIFIED") throw new Error(`${CONTRACT}_SUPPLIER_ACCOUNT_NOT_VERIFIED`);
if (text(supplier.configuration?.compute_supplier).toLowerCase() !== "modal") {
  throw new Error(`${CONTRACT}_MODAL_SUPPLIER_REQUIRED`);
}
if (text(supplier.configuration?.modal_app) !== MODAL_APP) {
  throw new Error(`${CONTRACT}_MODAL_APP_BINDING_INVALID`);
}
if (text(supplier.configuration?.transport) !== "modal-js-sdk-function-call-v1") {
  throw new Error(`${CONTRACT}_DIRECT_TRANSPORT_BINDING_INVALID`);
}

const pricingResult = await supabaseAdmin
  .from("provider_pricing")
  .select("capability,provider,model,unit,cost_per_unit,markup_percent,active,metadata")
  .eq("provider", PROVIDER)
  .in("capability", FUNCTIONS.map((entry) => entry.capability));
if (pricingResult.error) throw pricingResult.error;
const pricingRows = list(pricingResult.data);
if (pricingRows.length !== FUNCTIONS.length) {
  throw new Error(`${CONTRACT}_PRICING_ROWS_REQUIRED:${pricingRows.length}`);
}
for (const entry of FUNCTIONS) {
  const row = pricingRows.find((candidate) => text(candidate.capability) === entry.capability);
  if (!row) throw new Error(`${CONTRACT}_PRICING_ROW_REQUIRED:${entry.capability}`);
  if (row.active === true) throw new Error(`${CONTRACT}_PRODUCTION_PRICING_MUST_REMAIN_INACTIVE:${entry.capability}`);
  if (text(row.metadata?.production_routing_allowed).toLowerCase() !== "false") {
    throw new Error(`${CONTRACT}_PRODUCTION_ROUTING_MUST_REMAIN_DISABLED:${entry.capability}`);
  }
  if (text(row.metadata?.economics_certified).toLowerCase() !== "false") {
    throw new Error(`${CONTRACT}_ECONOMICS_MUST_REMAIN_UNCERTIFIED:${entry.capability}`);
  }
  if (text(row.metadata?.infrastructure_provider) !== "MODAL_A10G_ASYNC_V1") {
    throw new Error(`${CONTRACT}_MODAL_INFRASTRUCTURE_REQUIRED:${entry.capability}`);
  }
  if (text(row.metadata?.runpod_cost_basis_retired).toLowerCase() !== "true") {
    throw new Error(`${CONTRACT}_RUNPOD_COST_BASIS_MUST_BE_RETIRED:${entry.capability}`);
  }
}

const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID, 500);
const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET, 1000);
if (!tokenId || !tokenSecret) throw new Error(`${CONTRACT}_MODAL_DIRECT_CREDENTIALS_REQUIRED`);
const modalEnvironment = text(process.env.AVANTIQO_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT, 120);
const modal = new ModalClient({ tokenId, tokenSecret });

const functionReports = [];
try {
  for (const entry of FUNCTIONS) {
    const worker = await modal.functions.fromName(
      MODAL_APP,
      entry.name,
      modalEnvironment ? { environment: modalEnvironment } : {},
    );
    const stats = await worker.getCurrentStats();
    const backlog = finite(stats?.backlog);
    const runners = finite(stats?.numTotalRunners);
    if (backlog !== 0 || runners !== 0) {
      throw new Error(`${CONTRACT}_DUPLICATE_GPU_GUARD_ACTIVE:${entry.name}:backlog=${backlog}:runners=${runners}`);
    }
    functionReports.push({
      capability: entry.capability,
      function: entry.name,
      backlog,
      total_runners: runners,
    });
  }
} finally {
  modal.close();
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  phase: "PREFLIGHT",
  source_main_commit: sourceMain,
  organization_source: "CANONICAL_AVANTIQO_PLATFORM_DATABASE_RECORD",
  organization_id_printed: false,
  provider: PROVIDER,
  modal_app: MODAL_APP,
  modal_transport: "modal-js-sdk-function-call-v1",
  modal_gateway_required: false,
  runpod_primary_used: false,
  supplier_status: upper(supplier.status),
  supplier_verification_status: upper(supplier.verification_status),
  supplier_verification_method: text(supplier.verification_method),
  pricing_rows: pricingRows.map((row) => ({
    capability: row.capability,
    model: row.model,
    unit: row.unit,
    active: row.active === true,
    pricing_status: text(row.metadata?.pricing_status),
    production_routing_allowed: text(row.metadata?.production_routing_allowed).toLowerCase() === "true",
    economics_certified: text(row.metadata?.economics_certified).toLowerCase() === "true",
    infrastructure_provider: text(row.metadata?.infrastructure_provider),
  })),
  functions: functionReports,
  max_gpu_containers_per_function: 1,
  max_paid_jobs: 0,
  gpu_requested: false,
  gpu_inference_performed: false,
  modal_function_invoked: false,
  deployment_performed: false,
  production_vercel_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
