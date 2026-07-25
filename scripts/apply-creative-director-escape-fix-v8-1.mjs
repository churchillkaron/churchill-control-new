#!/usr/bin/env node

import fs from "node:fs";
import { spawnSync } from "node:child_process";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function checkJavaScript(path, errorCode) {
  const result = spawnSync(process.execPath, ["--check", path], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(errorCode);
  }
}

function patchMaterializedProvider() {
  const path = "lib/platform/service-runtime/providers/openai/OpenAIProvider.js";
  let source = read(path);
  const marker = "CREATIVE_OPENAI_STRUCTURED_RECOVERY_ESCAPE_V8_1";
  const functionStart = source.indexOf(
    "function responseOutputText(response = {}) {",
  );
  const functionEnd = source.indexOf(
    "\n\nfunction responseRefusal(response = {}) {",
    functionStart,
  );

  if (functionStart < 0 || functionEnd < 0) {
    throw new Error("CREATIVE_OPENAI_RESPONSE_OUTPUT_TEXT_BOUNDARY_MISSING");
  }

  const canonicalFunction = [
    "function responseOutputText(response = {}) {",
    "  const direct = String(response.output_text || \"\").trim();",
    "  if (direct) return direct;",
    "",
    "  return list(response.output)",
    "    .flatMap((item) => list(item?.content))",
    "    .map((content) =>",
    "      content?.text ||",
    "      content?.output_text ||",
    "      content?.value ||",
    "      \"\"",
    "    )",
    "    .filter(Boolean)",
    "    .join(\"\\n\")",
    "    .trim();",
    "}",
  ].join("\n");

  source =
    source.slice(0, functionStart) +
    canonicalFunction +
    source.slice(functionEnd);

  if (!source.includes(marker)) {
    const parentMarker = "// CREATIVE_OPENAI_STRUCTURED_RECOVERY_V8";
    if (!source.includes(parentMarker)) {
      throw new Error("CREATIVE_OPENAI_STRUCTURED_RECOVERY_V8_MARKER_MISSING");
    }
    source = source.replace(
      parentMarker,
      `${parentMarker}\n// ${marker}`,
    );
  }

  if (!source.includes('    .join("\\n")')) {
    throw new Error("CREATIVE_OPENAI_PROVIDER_NEWLINE_ESCAPE_NOT_REPAIRED");
  }
  if (/\.join\("\r?\n"\)/.test(source)) {
    throw new Error("CREATIVE_OPENAI_PROVIDER_LITERAL_NEWLINE_REMAINS");
  }

  write(path, source);
  checkJavaScript(
    path,
    "CREATIVE_OPENAI_PROVIDER_SYNTAX_INVALID_AFTER_ESCAPE_REPAIR",
  );
}

function patchOriginalMaterializer() {
  const path = "scripts/apply-creative-director-structured-output-v8.mjs";
  let source = read(path);
  const replacementStart = source.indexOf("const replacement = `");
  const replacementEnd = source.indexOf(
    "async function generateText({",
    replacementStart,
  );
  const unsafe = '    .join("\\n")';
  const safe = '    .join("\\\\n")';

  if (replacementStart < 0 || replacementEnd < 0) {
    throw new Error("CREATIVE_DIRECTOR_V8_REPLACEMENT_BOUNDARY_MISSING");
  }

  const replacementSection = source.slice(replacementStart, replacementEnd);
  if (!replacementSection.includes(safe)) {
    const unsafeOffset = replacementSection.indexOf(unsafe);
    if (unsafeOffset < 0) {
      throw new Error("CREATIVE_DIRECTOR_V8_UNSAFE_ESCAPE_NOT_FOUND");
    }
    const absoluteOffset = replacementStart + unsafeOffset;
    source =
      source.slice(0, absoluteOffset) +
      safe +
      source.slice(absoluteOffset + unsafe.length);
  }

  const repairedSection = source.slice(replacementStart, replacementEnd);
  if (!repairedSection.includes(safe)) {
    throw new Error("CREATIVE_DIRECTOR_V8_MATERIALIZER_ESCAPE_NOT_REPAIRED");
  }

  write(path, source);
  checkJavaScript(
    path,
    "CREATIVE_DIRECTOR_V8_MATERIALIZER_SYNTAX_INVALID_AFTER_ESCAPE_REPAIR",
  );
}

patchMaterializedProvider();
patchOriginalMaterializer();

console.log("CREATIVE_DIRECTOR_STRUCTURED_OUTPUT_ESCAPE_V8_1=APPLIED");
