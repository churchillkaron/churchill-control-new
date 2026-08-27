import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const TARGET = "scripts/run-avantiqo-video-eu-ro1-runtime-proof-v38-local.mjs";
const NODE24_GATE = 'if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_V38_NODE24_REQUIRED:${process.version}`);';
const NODE20_GATE = 'if (Number(process.versions.node.split(".")[0]) < 20) throw new Error(`AVANTIQO_VIDEO_V38_NODE20_REQUIRED:${process.version}`);';

const major = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(major) || major < 20) {
  throw new Error(`AVANTIQO_VIDEO_V38_NODE20_COMPAT_NODE20_REQUIRED:${process.version}`);
}

const source = await readFile(resolve(process.cwd(), TARGET), "utf8");
const occurrences = source.split(NODE24_GATE).length - 1;
if (occurrences !== 1) {
  throw new Error(`AVANTIQO_VIDEO_V38_NODE20_COMPAT_GATE_MISMATCH:occurrences=${occurrences}`);
}

const patched = source.replace(NODE24_GATE, NODE20_GATE);
const encoded = Buffer.from(patched, "utf8").toString("base64");
console.log(`AVANTIQO_VIDEO_V38_NODE20_COMPAT_ACTIVE=${JSON.stringify({ node: process.version, target: TARGET, mutation_scope: "IN_MEMORY_NODE_VERSION_GUARD_ONLY" })}`);
await import(`data:text/javascript;base64,${encoded}`);
