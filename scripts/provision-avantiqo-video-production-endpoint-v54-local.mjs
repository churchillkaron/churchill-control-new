import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = "scripts/provision-avantiqo-video-production-endpoint-v53-local.mjs";

function replaceExactlyOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`AVANTIQO_VIDEO_V54_SOURCE_TRANSFORM_${label}_MISMATCH:occurrences=${count}`);
  }
  return source.replace(search, replacement);
}

let source = await readFile(resolve(process.cwd(), BASE), "utf8");

source = replaceExactlyOnce(
  source,
  `    volumeInGb: Math.max(0, finite(baseTemplate?.volumeInGb, 0)),\n`,
  ``,
  "REMOVE_SERVERLESS_TEMPLATE_VOLUME_IN_GB",
);

source = replaceExactlyOnce(
  source,
  `    volumeInGb: finite(template.volumeInGb, 0),\n`,
  ``,
  "IGNORE_SERVERLESS_TEMPLATE_VOLUME_IN_GB_IN_CONTRACT",
);

source = source.replaceAll("V53", "V54");
if (source.includes("V53")) {
  throw new Error("AVANTIQO_VIDEO_V54_SOURCE_TRANSFORM_V53_REMAINS");
}

console.log(`AVANTIQO_VIDEO_V54_SOURCE_TRANSFORM_ACTIVE=${JSON.stringify({
  base: BASE,
  fix: "OMIT_VOLUME_IN_GB_FROM_SERVERLESS_TEMPLATE_CREATE_AND_TEMPLATE_CONTRACT",
  network_volume_attachment_preserved_at_endpoint_layer: true,
  network_volume_mount_path_preserved: true,
  graphql_multi_volume_object_shape_preserved: true,
  allowed_cuda_versions_preserved: true,
  workers_min: 0,
  workers_max: 1,
  generation_submitted: false,
  inference_performed: false,
  model_download_performed: false,
  safe_lease_changed: false,
  image_endpoint_changed: false,
})}`);

const encoded = Buffer.from(source, "utf8").toString("base64");
await import(`data:text/javascript;base64,${encoded}`);
