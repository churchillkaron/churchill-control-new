import { installCodeCertificationSupabaseSafeReadRetry } from "../lib/code/runtime/CodeAICertificationSupabaseReadResilience.js";

const CONTRACT = "AVANTIQO_CODE_AI_CERTIFICATION_SUPABASE_SAFE_READ_PRELOAD_V1";

if (String(process.env.AVANTIQO_CODE_CERTIFICATION_SUPABASE_SAFE_READ_ENABLED || "").trim().toUpperCase() === "YES") {
  installCodeCertificationSupabaseSafeReadRetry();
  if (String(process.env.AVANTIQO_CODE_CERTIFICATION_SUPABASE_SAFE_READ_PRELOAD_LOG || "").trim().toUpperCase() === "YES") {
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_CERTIFICATION_SUPABASE_SAFE_READ_PRELOAD_ACTIVE",
      contract: CONTRACT,
      retry_scope: "SUPABASE_GET_HEAD_ONLY",
      provider_post_retry_enabled: false,
      wallet_write_retry_enabled: false,
      usage_write_retry_enabled: false,
      production_deploy_performed: false,
      secrets_printed: false,
    }));
  }
}
