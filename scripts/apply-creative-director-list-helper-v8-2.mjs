#!/usr/bin/env node

import fs from "node:fs";
import { spawnSync } from "node:child_process";

const MARKER = "CREATIVE_MISSION_DIRECTOR_LIST_HELPER_V8_2";
const COMPOSER = "lib/creative/intent/CreativeMissionComposerRuntime.js";
const MATERIALIZER = "scripts/apply-creative-director-structured-output-v8.mjs";
const HELPER = [
  `// ${MARKER}`,
  "function list(value) {",
  "  if (value == null) return [];",
  "  return Array.isArray(value) ? value.filter(Boolean) : [value];",
  "}",
  "",
].join("\n");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function check(path, errorCode) {
  const result = spawnSync(process.execPath, ["--check", path], {
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(errorCode);
}

function patchComposer() {
  let source = read(COMPOSER);
  if (!source.includes(MARKER)) {
    const anchor = "function compactMissionAsset(asset = {}) {";
    if (!source.includes(anchor)) {
      throw new Error("CREATIVE_MISSION_DIRECTOR_LIST_HELPER_ANCHOR_MISSING");
    }
    source = source.replace(anchor, HELPER + anchor);
  }
  if (!source.includes("function list(value)")) {
    throw new Error("CREATIVE_MISSION_DIRECTOR_LIST_HELPER_MISSING");
  }
  write(COMPOSER, source);
  check(COMPOSER, "CREATIVE_MISSION_COMPOSER_SYNTAX_INVALID_V8_2");
}

function patchMaterializer() {
  let source = read(MATERIALIZER);
  if (!source.includes(MARKER)) {
    const anchor = "function patchMissionComposer() {";
    if (!source.includes(anchor)) {
      throw new Error("CREATIVE_DIRECTOR_V8_MATERIALIZER_ANCHOR_MISSING");
    }
    const helperLiteral = JSON.stringify(HELPER);
    const patch = [
      "function patchMissionComposerListHelper() {",
      `  const path = ${JSON.stringify(COMPOSER)};`,
      "  let source = read(path);",
      `  if (!source.includes(${JSON.stringify(MARKER)})) {`,
      "    const anchor = \"function compactMissionAsset(asset = {}) {\";",
      "    if (!source.includes(anchor)) {",
      "      throw new Error(\"CREATIVE_MISSION_DIRECTOR_LIST_HELPER_ANCHOR_MISSING\");",
      "    }",
      `    source = source.replace(anchor, ${helperLiteral} + anchor);`,
      "  }",
      "  write(path, source);",
      "}",
      "",
    ].join("\n");
    source = source.replace(anchor, patch + anchor);
    const callAnchor = "patchMissionComposer();";
    if (!source.includes(callAnchor)) {
      throw new Error("CREATIVE_DIRECTOR_V8_MATERIALIZER_CALL_ANCHOR_MISSING");
    }
    source = source.replace(
      callAnchor,
      "patchMissionComposerListHelper();\n" + callAnchor,
    );
  }
  write(MATERIALIZER, source);
  check(MATERIALIZER, "CREATIVE_DIRECTOR_V8_MATERIALIZER_SYNTAX_INVALID_V8_2");
}

patchComposer();
patchMaterializer();

console.log("CREATIVE_DIRECTOR_LIST_HELPER_V8_2=APPLIED");
