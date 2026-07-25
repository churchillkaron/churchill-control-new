#!/usr/bin/env node

import fs from "node:fs";
import { spawnSync } from "node:child_process";

const MARKER = "CREATIVE_MISSION_DIRECTOR_LIST_HELPER_V8_2";

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
  if (result.status !== 0) throw new Error(errorCode);
}

function helperSource() {
  return [
    `// ${MARK