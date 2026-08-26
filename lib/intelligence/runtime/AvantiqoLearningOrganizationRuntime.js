import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_LEARNING_ORGANIZATION_CONTRACT =
  "AVANTIQO_LEARNING_ORGANIZATION_V1";

const CANONICAL_ORGANIZATION_NAME = "Avantiqo Platform";
const CANONICAL_ORGANIZATION_TYPE = "enterprise_group";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function validUuid(value) {
  return UUID_PATTERN.test(text(value, 160));
}

export async function resolveAvantiqoLearningOrganization({
  allowDatabaseFallback = true,
} = {}) {
  const configuredId = text(
    process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID,
    160,
  );

  if (configuredId) {
    if (!validUuid(configuredId)) {
      throw new Error("AVANTIQO_LEARNING_ORGANIZATION_ENV_ID_INVALID");
    }
    return {
      contract: AVANTIQO_LEARNING_ORGANIZATION_CONTRACT,
      organization_id: configuredId,
      source: "ENVIRONMENT_OVERRIDE",
      canonical_name: CANONICAL_ORGANIZATION_NAME,
      database_fallback_used: false,
      organization_created: false,
    };
  }

  if (!allowDatabaseFallback) {
    return {
      contract: AVANTIQO_LEARNING_ORGANIZATION_CONTRACT,
      organization_id: null,
      source: "UNCONFIGURED",
      canonical_name: CANONICAL_ORGANIZATION_NAME,
      database_fallback_used: false,
      organization_created: false,
    };
  }

  const result = await supabaseAdmin
    .from("organizations")
    .select("id,name,organization_type,status,organization_status")
    .eq("name", CANONICAL_ORGANIZATION_NAME)
    .eq("organization_type", CANONICAL_ORGANIZATION_TYPE)
    .eq("status", "active")
    .eq("organization_status", "ACTIVE")
    .limit(3);
  if (result.error) throw result.error;

  const matches = Array.isArray(result.data) ? result.data : [];
  if (matches.length === 0) {
    throw new Error("AVANTIQO_LEARNING_ORGANIZATION_CANONICAL_RECORD_NOT_FOUND");
  }
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_LEARNING_ORGANIZATION_CANONICAL_RECORD_AMBIGUOUS:${matches.length}`,
    );
  }

  const row = matches[0];
  const organizationId = text(row?.id, 160);
  if (!validUuid(organizationId)) {
    throw new Error("AVANTIQO_LEARNING_ORGANIZATION_CANONICAL_ID_INVALID");
  }

  return {
    contract: AVANTIQO_LEARNING_ORGANIZATION_CONTRACT,
    organization_id: organizationId,
    source: "CANONICAL_DATABASE_RECORD",
    canonical_name: CANONICAL_ORGANIZATION_NAME,
    canonical_type: CANONICAL_ORGANIZATION_TYPE,
    database_fallback_used: true,
    organization_created: false,
  };
}

export async function ensureAvantiqoLearningOrganizationEnvironment() {
  const resolved = await resolveAvantiqoLearningOrganization();
  process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID =
    resolved.organization_id;
  return resolved;
}

export const AvantiqoLearningOrganizationRuntime = Object.freeze({
  contract: AVANTIQO_LEARNING_ORGANIZATION_CONTRACT,
  resolve: resolveAvantiqoLearningOrganization,
  ensureEnvironment: ensureAvantiqoLearningOrganizationEnvironment,
});
