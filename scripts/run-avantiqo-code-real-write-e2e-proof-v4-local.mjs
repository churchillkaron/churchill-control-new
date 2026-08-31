import { readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_E2E_PROOF_V4_LAUNCHER";
const V1_PATH = "scripts/run-avantiqo-code-real-write-e2e-proof-v1-local.mjs";
const V3_PATH = "scripts/run-avantiqo-code-real-write-e2e-proof-v3-local.mjs";
const V1_DECLARATION = 'const V1_PATH = "scripts/run-avantiqo-code-real-write-e2e-proof-v1-local.mjs";';
const REPORT_MARKER = "const report = {\n  success:";
const CONTRACT_PROOF_MARKER = "  contract: CONTRACT,\n  proof: {";

const v1Temp = path.join(os.tmpdir(), `avantiqo-code-real-write-v4-v1-${process.pid}-${Date.now()}.mjs`);
const v3Temp = path.join(os.tmpdir(), `avantiqo-code-real-write-v4-v3-${process.pid}-${Date.now()}.mjs`);

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_REAL_WRITE_E2E_V4_START",
  contract: CONTRACT,
  dynamic_live_volume_discovery: true,
  exact_generated_source_visible: true,
  production_deploy_performed: false,
  secrets_printed: false,
}));

try {
  const [v1Source, v3Source] = await Promise.all([
    readFile(V1_PATH, "utf8"),
    readFile(V3_PATH, "utf8"),
  ]);

  if (!v1Source.includes(REPORT_MARKER)) {
    throw new Error(`${CONTRACT}_V1_REPORT_MARKER_MISSING`);
  }
  if (!v1Source.includes(CONTRACT_PROOF_MARKER)) {
    throw new Error(`${CONTRACT}_V1_PROOF_MARKER_MISSING`);
  }
  if (!v3Source.includes(V1_DECLARATION)) {
    throw new Error(`${CONTRACT}_V3_V1_DECLARATION_MISSING`);
  }

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

  const visibleV3 = v3Source.replace(
    V1_DECLARATION,
    `const V1_PATH = ${JSON.stringify(v1Temp)};`,
  );

  await writeFile(v1Temp, visibleV1, "utf8");
  await writeFile(v3Temp, visibleV3, "utf8");

  await import(`${pathToFileURL(v3Temp).href}?v=${Date.now()}`);
  console.log(`${CONTRACT}=PASS`);
} finally {
  await Promise.all([
    unlink(v1Temp).catch(() => {}),
    unlink(v3Temp).catch(() => {}),
  ]);
}
