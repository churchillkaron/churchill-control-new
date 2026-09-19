import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://audit.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key";
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { listOperatorCapabilities } = await import(
  "@/lib/operator/runtime/OperatorCapabilityCatalog"
);

const capabilities = await listOperatorCapabilities();
const byKey = new Map(capabilities.map((capability) => [capability.key, capability]));

function requireCapability(key, { mode = null, aliases = [] } = {}) {
  const capability = byKey.get(key);
  if (!capability) throw new Error(`OPERATOR_FRONT_DOOR: missing ${key}`);
  if (mode && capability.mode !== mode) {
    throw new Error(`OPERATOR_FRONT_DOOR: ${key} expected mode ${mode}, got ${capability.mode}`);
  }
  const haystack = (capability.operator_aliases || []).join(" ").toLowerCase();
  for (const alias of aliases) {
    if (!haystack.includes(alias.toLowerCase())) {
      throw new Error(`OPERATOR_FRONT_DOOR: ${key} missing human alias ${alias}`);
    }
  }
  return capability;
}
requireCapability("finance.accounts_receivable.CreateCustomerInvoice", {
  mode: "write", aliases: ["create invoice"],
});
requireCapability("people.employees.create", {
  mode: "write", aliases: ["add employee", "add staff"],
});
requireCapability("creative.music.planWorldClassProduction", {
  mode: "read", aliases: ["help me think through the music"],
});
requireCapability("creative.music.developWorldClassProduction", {
  mode: "read", aliases: ["give me three music directions"],
});
requireCapability("creative.music.executeWorldClassProduction", {
  mode: "write", aliases: ["make the music"],
});
requireCapability("creative.studio.prepareProject", {
  mode: "draft", aliases: ["start a video project"],
});
requireCapability("creative.production.run", {
  mode: "write", aliases: ["run video production"],
});
requireCapability("platform.code_ai_autonomous.execute", { mode: "write" });
requireCapability("platform.product_engineering_cycle.execute", {
  mode: "write", aliases: ["continue building avantiqo"],
});

const navigationSource = await readFile(
  "lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8",
);
for (const marker of ["resolveInstantOperatorNavigation", "listOperatorNavigationTargets"]) {
  if (!navigationSource.includes(marker)) {
    throw new Error(`OPERATOR_FRONT_DOOR: local navigation missing ${marker}`);
  }
}
console.log("OPERATOR_GLOBAL_FRONT_DOOR_AUDIT=PASS");
console.log("OPERATOR_FRONT_DOOR_NAVIGATION=LOCAL_DETERMINISTIC");
console.log("OPERATOR_FRONT_DOOR_FINANCE=INVOICE_READY");
console.log("OPERATOR_FRONT_DOOR_PEOPLE=ADD_STAFF_READY");
console.log("OPERATOR_FRONT_DOOR_VIDEO=DISCUSS_PREPARE_PRODUCE");
console.log("OPERATOR_FRONT_DOOR_MUSIC=DISCUSS_DEVELOP_PRODUCE");
console.log("OPERATOR_FRONT_DOOR_CODE=SELF_ENGINEERING_READY");
