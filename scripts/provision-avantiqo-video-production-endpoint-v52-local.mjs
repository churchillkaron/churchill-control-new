import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = "scripts/provision-avantiqo-video-production-endpoint-v51-local.mjs";

function replaceExactlyOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`AVANTIQO_VIDEO_V52_SOURCE_TRANSFORM_${label}_MISMATCH:occurrences=${count}`);
  }
  return source.replace(search, replacement);
}

let source = await readFile(resolve(process.cwd(), BASE), "utf8");

source = replaceExactlyOnce(
  source,
  `function resolveTemplate(endpoint, templates) {\n  const templateId = text(endpoint?.templateId || endpoint?.template?.id);\n  if (!templateId) throw new Error("AVANTIQO_VIDEO_CERTIFICATION_TEMPLATE_ID_REQUIRED");\n  const inline = object(endpoint?.template);\n  if (Object.keys(inline).length && text(inline.id) === templateId) return inline;\n  const matches = templates.filter((template) => text(template?.id) === templateId);\n  if (matches.length !== 1) {\n    throw new Error(\`AVANTIQO_VIDEO_CERTIFICATION_TEMPLATE_RESOLUTION_FAILED:matches=\${matches.length}\`);\n  }\n  return matches[0];\n}`,
  `function resolveTemplate(endpoint, templates) {\n  const templateId = text(endpoint?.templateId || endpoint?.template?.id);\n  if (!templateId) throw new Error("AVANTIQO_VIDEO_CERTIFICATION_TEMPLATE_ID_REQUIRED");\n  const matches = templates.filter((template) => text(template?.id) === templateId);\n  if (matches.length !== 1) {\n    throw new Error(\`AVANTIQO_VIDEO_CERTIFICATION_TEMPLATE_RESOLUTION_FAILED:matches=\${matches.length}\`);\n  }\n  return matches[0];\n}`,
  "FULL_TEMPLATE_LIST_RESOLUTION",
);

source = source.replaceAll("V51", "V52");
if (source.includes("V51")) {
  throw new Error("AVANTIQO_VIDEO_V52_SOURCE_TRANSFORM_V51_REMAINS");
}

console.log(`AVANTIQO_VIDEO_V52_SOURCE_TRANSFORM_ACTIVE=${JSON.stringify({
  base: BASE,
  fix: "RESOLVE_BOUND_TEMPLATE_FROM_FULL_TEMPLATE_LIST_NOT_PARTIAL_ENDPOINT_INLINE_TEMPLATE",
  runpod_mutation_before_apply: false,
  generation_submitted: false,
  inference_performed: false,
  model_download_performed: false,
  safe_lease_changed: false,
  image_endpoint_changed: false,
})}`);

const encoded = Buffer.from(source, "utf8").toString("base64");
await import(`data:text/javascript;base64,${encoded}`);
