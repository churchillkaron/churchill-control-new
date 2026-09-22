import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-audio";
const LOCAL_CAPABILITIES = Object.freeze([
  "ai.music.generate",
  "ai.sfx.generate",
  "ai.audio.stems",
  "ai.audio.vocal-correct",
  "ai.audio.elastic-warp",
]);
const TARGET_CAPABILITIES = Object.freeze([
  ...LOCAL_CAPABILITIES,
  "ai.audio.generate",
  "ai.audio.edit",
  "ai.audio.extend",
  "ai.audio.remix",
  "ai.audio.vocal-role-separate",
  "ai.audio.mix",
  "ai.audio.master",
]);
function text(value) { return String(value ?? "").trim(); }
function enabled(value) { return ["1","true","yes","on"].includes(text(value).toLowerCase()); }
function score(value, fallback) { const number=Number(value); return Number.isFinite(number) ? Math.max(0,Math.min(100,number)) : fallback; }
function configuredCapabilities(value) {
  const requested=text(value).split(",").map((item)=>item.trim()).filter(Boolean);
  const source=requested.length ? requested : ["ai.music.generate"];
  const unsupported=source.filter((item)=>!LOCAL_CAPABILITIES.includes(item));
  if (unsupported.length) throw new Error(`AVANTIQO_AUDIO_LOCAL_CAPABILITY_NOT_IMPLEMENTED:${unsupported.join(",")}`);
  return [...new Set(source)];
}

const localComputeConfigured=enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED);
const engineEnabled=enabled(process.env.AVANTIQO_AUDIO_ENGINE_ENABLED);
const capabilities=configuredCapabilities(process.env.AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES);
const existing=PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID]={
  ...existing,
  id:PROVIDER_ID,
  name:"Avantiqo Music",
  category:"ai",
  connectionModel:"managed",
  capabilities,
  countries:["*"],
  currencies:["*"],
  runtime:"avantiqo_audio",
  runtimeAvailable:Boolean(engineEnabled && localComputeConfigured && capabilities.length),
  active:true,
  quality_score:score(process.env.AVANTIQO_AUDIO_ENGINE_QUALITY_SCORE,existing.quality_score ?? 90),
  speed_score:score(process.env.AVANTIQO_AUDIO_ENGINE_SPEED_SCORE,existing.speed_score ?? 76),
  reliability_score:score(process.env.AVANTIQO_AUDIO_ENGINE_RELIABILITY_SCORE,existing.reliability_score ?? 84),
  metadata:{
    ...(existing.metadata || {}),
    owned_by:"AVANTIQO",
    managed_by:"AVANTIQO",
    supplier_type:"OWNED_INFERENCE",
    infrastructure_provider:"AVANTIQO_LOCAL_NODE_V1",
    infrastructure_candidates:["AVANTIQO_LOCAL_NODE_V1"],
    local_only_execution:true,
    modal_fallback_allowed:false,
    engine_contract:"AVANTIQO_AUDIO_ENGINE_V1",
    product_model:"avantiqo-music-v1",
    benchmark_gate:true,
    owned_only_required:true,
    external_provider_fallback_allowed:false,
    provider_selection_exposed:false,
    raw_reasoning_persisted:false,
    target_capabilities:TARGET_CAPABILITIES,
    implemented_capabilities:LOCAL_CAPABILITIES,
    certified_capabilities:capabilities,
    foundation_models:[
      "ACE-Step/Ace-Step1.5",
      "OpenMOSS-Team/MOSS-SoundEffect-v2.0",
      "facebookresearch/demucs:htdemucs_ft",
      "torchcrepe-full",
      "signalsmith-stretch",
    ],
    runtime_configuration:{
      enabled:engineEnabled,
      local_compute_configured:localComputeConfigured,
      local_only:true,
      modal_fallback_allowed:false,
      transport:"supabase-pull-queue-v1",
      queue_endpoint:true,
      scale_to_zero:false,
    },
  },
};

export const AVANTIQO_AUDIO_PROVIDER_ID=PROVIDER_ID;
