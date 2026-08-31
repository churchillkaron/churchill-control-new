import { readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_E2E_PROOF_V6_AP_JP1";
const V1_PATH = "scripts/run-avantiqo-code-real-write-e2e-proof-v1-local.mjs";
const REPORT_MARKER = "const report = {\n  success:";
const CONTRACT_PROOF_MARKER = "  contract: CONTRACT,\n  proof: {";
const VOLUME_ID = "ov58rf8zng";
const DATA_CENTER_ID = "AP-JP-1";
const GPU_TYPE_ID = "NVIDIA H200";
const tempPath = path.join(os.tmpdir(), `avantiqo-code-real-write-v6-v1-${process.pid}-${Date.now()}.mjs`);

process.env.AVANTIQO_CODE_E2E_NETWORK_VOLUME_ID = VOLUME_ID;
process.env.AVANTIQO_CODE_E2E_DATA_CENTER_ID = DATA_CENTER_ID;
process.env.AVANTIQO_CODE_E2E_GPU_TYPE_IDS = GPU_TYPE_ID;

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_REAL_WRITE_E2E_V6_START",
  contract: CONTRACT,
  network_volume_id: VOLUME_ID,
  data_center_id: DATA_CENTER_ID,
  gpu_type_id: GPU_TYPE_ID,
  verified_cache_required: true,
  exact_generated_source_visible: true,
  production_deploy_performed: false,
  secrets_printed: false,
}));

try {
  const v1Source = await readFile(V1_PATH, "utf8");
  if (!v1Source.includes(REPORT_MARKER)) throw new Error(`${CONTRACT}_V1_REPORT_MARKER_MISSING`);
  if (!v1Source.includes(CONTRACT_PROOF_MARKER)) throw new Error(`${CONTRACT}_V1_PROOF_MARKER_MISSING`);

  const visibleV1 = v1Source
    .replace(
      REPORT_MARKER,
      [
        "if (generatedTestsPassed && generatedSource) {",
        "  console.log(\"AVANTIQO_CODE_GENERATED_SOURCE_BEGIN\");",
        "  process.stdout.write(generatedSource.endsWith(\"\\n\") ? generatedSource : `${generatedSource}\\n`);",
        "  console.log(\"AVANTIQO_CODE_GENERATED_SOURCE_END\");",
        "}",
        "",
        REPORT_MARKER,
      ].join("\n"),
    )
    .replace(
      CONTRACT_PROOF_MARKER,
      [
        "  contract: CONTRACT,",
        "  generated_file: {",
        "    path: MODULE_NAME,",
        "    content: generatedSource || null,",
        "    sha256: generatedSourceSha256 || null,",
        "  },",
        "  proof: {",
      ].join("\n"),
    );

  await writeFile(tempPath, visibleV1, "utf8");
  await import(`${pathToFileURL(tempPath).href}?v=${Date.now()}`);
  console.log(`${CONTRACT}=PASS`);
} finally {
  await unlink(tempPath).catch(() => {});
}
