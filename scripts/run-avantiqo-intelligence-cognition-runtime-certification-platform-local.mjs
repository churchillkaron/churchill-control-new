import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_INTELLIGENCE_COGNITION_PLATFORM_SCOPE_V1";
const CANONICAL_ORGANIZATION_NAME = "Avantiqo Platform";
const CANONICAL_ORGANIZATION_TYPE = "enterprise_group";
const PLATFORM_DEFAULT_MAX_PROJECTED_CUSTOMER_CHARGE = "10";
const CHILD = resolve(
  "scripts/run-avantiqo-intelligence-cognition-runtime-certification-local.mjs",
);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const explicitOrganizationId = text(
  process.env.AVANTIQO_INTELLIGENCE_COGNITION_CERT_ORGANIZATION_ID,
  160,
);

let organizationId = explicitOrganizationId;
let organizationSource = explicitOrganizationId ? "EXPLICIT_CERT_ENV" : null;

if (!organizationId) {
  const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
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
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_COGNITION_PLATFORM_SCOPE_RESOLUTION_FAILED:${matches.length}`,
    );
  }

  organizationId = text(matches[0]?.id, 160);
  if (!organizationId) {
    throw new Error("AVANTIQO_COGNITION_PLATFORM_SCOPE_ID_REQUIRED");
  }
  organizationSource = "CANONICAL_AVANTIQO_PLATFORM_DATABASE_RECORD";
}

const child = spawnSync(
  process.execPath,
  [CHILD, ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_INTELLIGENCE_COGNITION_CERT_ORGANIZATION_ID: organizationId,
      AVANTIQO_INTELLIGENCE_COGNITION_CERT_ORGANIZATION_SOURCE:
        organizationSource,
      AVANTIQO_INTELLIGENCE_COGNITION_CERT_MAX_CUSTOMER_CHARGE:
        text(
          process.env.AVANTIQO_INTELLIGENCE_COGNITION_CERT_MAX_CUSTOMER_CHARGE,
          80,
        ) || PLATFORM_DEFAULT_MAX_PROJECTED_CUSTOMER_CHARGE,
    },
    stdio: "inherit",
  },
);

if (child.error) throw child.error;
if (child.signal) {
  throw new Error(`AVANTIQO_COGNITION_PLATFORM_SCOPE_CHILD_SIGNAL:${child.signal}`);
}
if (child.status !== 0) process.exit(child.status || 1);

console.log(`${CONTRACT}=PASS`);
console.log(`AVANTIQO_COGNITION_PLATFORM_SCOPE_SOURCE=${organizationSource}`);
console.log(
  `AVANTIQO_COGNITION_PLATFORM_SCOPE_DEFAULT_MAX_CUSTOMER_CHARGE=${PLATFORM_DEFAULT_MAX_PROJECTED_CUSTOMER_CHARGE}`,
);
console.log("AVANTIQO_COGNITION_PLATFORM_SCOPE_ORGANIZATION_ID_PRINTED=false");
console.log("AVANTIQO_COGNITION_PLATFORM_SCOPE_ORGANIZATION_CREATED=false");
console.log("AVANTIQO_COGNITION_PLATFORM_SCOPE_DATABASE_MUTATED=false");
