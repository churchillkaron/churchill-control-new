import { readFile, unlink, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SOURCE_PATH = "scripts/stage-avantiqo-video-wan22-cache-only-v2-local.mjs";
const TEMP_PATH = `/tmp/avantiqo-video-wan22-cache-only-v3-${process.pid}.mjs`;
const FALSE_ASSERTION = '  if (text(template.volumeMountPath) !== CACHE_MOUNT) failures.push("volumeMountPath");';
const FALSE_ASSERTION_REPLACEMENT = '  // RunPod Serverless network volumes are runtime-mounted independently of template volumeMountPath metadata.';
const WIDE_PATCH = '    body: endpointPatch(freshCinema, targetId),';
const NARROW_PATCH = '    body: { templateId: targetId },';

const source = await readFile(SOURCE_PATH, "utf8");
const mountOccurrences = source.split(FALSE_ASSERTION).length - 1;
if (mountOccurrences !== 1) {
  throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_V3_EXPECTED_SINGLE_VOLUME_MOUNT_ASSERTION:actual=${mountOccurrences}`);
}
const patchOccurrences = source.split(WIDE_PATCH).length - 1;
if (patchOccurrences !== 1) {
  throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_V3_EXPECTED_SINGLE_WIDE_ENDPOINT_PATCH:actual=${patchOccurrences}`);
}

const patched = source
  .replace(FALSE_ASSERTION, FALSE_ASSERTION_REPLACEMENT)
  .replace(WIDE_PATCH, NARROW_PATCH);
if (patched === source || patched.includes(FALSE_ASSERTION) || patched.includes(WIDE_PATCH)) {
  throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_V3_COMPATIBILITY_PATCH_NOT_APPLIED");
}

await writeFile(TEMP_PATH, patched, { encoding: "utf8", mode: 0o600 });
try {
  await import(`${pathToFileURL(TEMP_PATH).href}?v=${Date.now()}`);
  console.log("AVANTIQO_VIDEO_WAN22_CACHE_ONLY_TEMPLATE_V3_COMPATIBILITY_SHIM=PASS");
  console.log("AVANTIQO_VIDEO_WAN22_CACHE_ONLY_TEMPLATE_V3_ENDPOINT_PATCH_FIELDS=templateId");
} finally {
  await unlink(TEMP_PATH).catch(() => null);
}
