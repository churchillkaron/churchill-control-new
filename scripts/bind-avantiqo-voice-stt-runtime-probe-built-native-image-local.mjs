import { readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BASE = "scripts/bind-avantiqo-voice-stt-runtime-probe-native-image-local.mjs";
const UNBUILT_SOURCE_SHA = "889c5e7e64aa20048e0b36edbdefa783eea12c63";
const BUILT_SOURCE_SHA = "01d73cef070696f30c46faba223216d1af97ef98";
const EXPECTED_HANDLER_BLOB = "f525911eaa1678761392c5f556c59c2881da7a9d";
const EXPECTED_DOCKERFILE_BLOB = "fe1ceb09e246a3ad1d851bbba3aaa3f5822e9d2d";
const EXPECTED_REQUIREMENTS_BLOB = "9b1f4d662a7b13b65d192493ed738998d2172698";

function replaceExactlyOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`AVANTIQO_VOICE_STT_BUILT_NATIVE_BIND_${label}_MISMATCH:occurrences=${count}`);
  }
  return source.replace(search, replacement);
}

let source = await readFile(resolve(process.cwd(), BASE), "utf8");

for (const [label, expected] of [
  ["HANDLER_BLOB", EXPECTED_HANDLER_BLOB],
  ["DOCKERFILE_BLOB", EXPECTED_DOCKERFILE_BLOB],
  ["REQUIREMENTS_BLOB", EXPECTED_REQUIREMENTS_BLOB],
]) {
  if (!source.includes(expected)) {
    throw new Error(`AVANTIQO_VOICE_STT_BUILT_NATIVE_BIND_${label}_LOCK_MISSING`);
  }
}

source = replaceExactlyOnce(
  source,
  `const TARGET_SOURCE_SHA = "${UNBUILT_SOURCE_SHA}";`,
  `const TARGET_SOURCE_SHA = "${BUILT_SOURCE_SHA}";`,
  "TARGET_SOURCE",
);

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_STT_BUILT_NATIVE_BIND_PREFLIGHT",
  base_script: BASE,
  built_source_sha: BUILT_SOURCE_SHA,
  built_image_tag: BUILT_SOURCE_SHA.slice(0, 9),
  handler_blob: EXPECTED_HANDLER_BLOB,
  dockerfile_blob: EXPECTED_DOCKERFILE_BLOB,
  requirements_blob: EXPECTED_REQUIREMENTS_BLOB,
  known_existing_native_image: true,
  provider_job_submitted: false,
  stt_jobs_submitted: 0,
  transcription_jobs_submitted: 0,
  tts_touched: false,
  secrets_printed: false,
}));

const generatedPath = resolve(
  process.cwd(),
  "scripts",
  `.avantiqo-voice-stt-built-native-bind-${process.pid}-${Date.now()}.mjs`,
);

try {
  await writeFile(generatedPath, source, { encoding: "utf8", flag: "wx" });
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`);
} finally {
  await unlink(generatedPath).catch(() => {});
}
