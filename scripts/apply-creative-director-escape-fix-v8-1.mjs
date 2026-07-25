#!/usr/bin/env node

import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function patchMaterializedProvider() {
  const path = "lib/platform/service-runtime/providers/openai/OpenAIProvider.js";
  let source = read(path);
  const marker = "CREATIVE_OPENAI_STRUCTURED_RECOVERY_ESCAPE_V8_1";

  source = source.replace(
    /\.join\("\s*"\)/,
    '.join("\\n")',
  );

  if (!source.includes(marker)) {
    source = source.replace(
      "// CREATIVE_OPENAI_STRUCTURED_RECOVERY_V8",
      `// CREATIVE_OPENAI_STRUCTURED_RECOVERY_V8\n// ${marker}`,
    );
  }

  if (!source.includes('.join("\\n")')) {
    throw new Error("CREATIVE_OPENAI_PROVIDER_NEWLINE_ESCAPE_NOT_REPAIRED");
  }
  if (/\.join\("\s*"\)/.test(source)) {
    throw new Error("CREATIVE_OPENAI_PROVIDER_BROKEN_NEWLINE_REMAINS");
  }

  write(path, source);
}

function patchOriginalMaterializer() {
  const path = "scripts/apply-creative-director-structured-output-v8.mjs";
  let source = read(path);
  const unsafe = '.join("\\n")';
  const safe = '.join("\\\\n")';

  if (source.includes(unsafe) && !source.includes(safe)) {
    source = source.replace(unsafe, safe);
  }

  if (!source.includes(safe)) {
    throw new Error("CREATIVE_DIRECTOR_V8_MATERIALIZER_ESCAPE_NOT_REPAIRED");
  }

  write(path, source);
}

patchMaterializedProvider();
patchOriginalMaterializer();

console.log("CREATIVE_DIRECTOR_STRUCTURED_OUTPUT_ESCAPE_V8_1=APPLIED");
