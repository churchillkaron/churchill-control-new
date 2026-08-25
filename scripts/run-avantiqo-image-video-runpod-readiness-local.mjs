import { readFile } from "node:fs/promises";

const ENV_PATH = ".env.local";
const TARGET = "./inspect-avantiqo-image-video-runpod-readiness-local.mjs";

function text(value) {
  return String(value ?? "").trim();
}

async function parseLocalEnv() {
  let source = "";
  try {
    source = await readFile(ENV_PATH, "utf8");
  } catch {
    return {};
  }

  const parsed = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    const [, name, rawValue] = match;
    let value = rawValue.trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    }
    parsed[name] = value;
  }
  return parsed;
}

const parsed = await parseLocalEnv();
let loaded = 0;
for (const [name, value] of Object.entries(parsed)) {
  if (!text(value)) continue;
  if (!text(process.env[name])) {
    process.env[name] = value;
    loaded += 1;
  }
}

console.log("AVANTIQO_IMAGE_VIDEO_RUNPOD_READINESS_LAUNCHER_ENV_EXECUTED=false");
console.log("AVANTIQO_IMAGE_VIDEO_RUNPOD_READINESS_LAUNCHER_MALFORMED_LINES_IGNORED=true");
console.log("AVANTIQO_IMAGE_VIDEO_RUNPOD_READINESS_LAUNCHER_SECRETS_PRINTED=false");
console.log(`AVANTIQO_IMAGE_VIDEO_RUNPOD_READINESS_LAUNCHER_VALUES_LOADED=${loaded}`);

await import(TARGET);
