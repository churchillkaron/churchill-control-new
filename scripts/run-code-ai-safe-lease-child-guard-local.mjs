import process from "node:process";
import { access, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  CHILD_TERMINATION_GRACE_MS,
  CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
} from "../lib/code/runtime/CodeAICertificationResiliencePolicy.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function text(value) {
  return String(value ?? "").trim();
}
async function exists(file) {
  if (!file) return false;
  try { await access(file); return true; } catch { return false; }
}
async function mark(file, value) {
  if (!file) return;
  await writeFile(file, `${value}\n`, "utf8").catch(() => {});
}

const readyFile = text(process.env.AVANTIQO_CODE_SAFE_LEASE_CHILD_READY_FILE);
const stopFile = text(process.env.AVANTIQO_CODE_SAFE_LEASE_CHILD_STOP_FILE);
const ackFile = text(process.env.AVANTIQO_CODE_SAFE_LEASE_CHILD_ACK_FILE);
const split = process.argv.indexOf("--");
const command = split < 0 ? [] : process.argv.slice(split + 1);
if (!command.length) {
  throw new Error("CODE_AI_SAFE_LEASE_CHILD_COMMAND_REQUIRED");
}

const child = spawn(command[0], command.slice(1), {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  detached: process.platform !== "win32",
});
await mark(readyFile, `${child.pid || "unknown"}:${new Date().toISOString()}`);

let exit = null;
let terminating = false;
child.on("exit", (code, signal) => {
  exit = { code, signal };
});

async function terminate(signal = "SIGTERM") {
  if (terminating) {
    while (!exit && terminating) await sleep(25);
    return;
  }
  terminating = true;
  if (!exit) {
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {}
    const deadline = Date.now() + CHILD_TERMINATION_GRACE_MS;
    while (!exit && Date.now() < deadline) await sleep(50);
    if (!exit) {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {}
      const killDeadline = Date.now() + 1000;
      while (!exit && Date.now() < killDeadline) await sleep(25);
    }
  }
  await mark(ackFile, `terminated:${new Date().toISOString()}`);
  terminating = false;
}

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(signal, async () => {
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_SAFE_LEASE_CHILD_TERMINATION",
      contract: CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
      signal,
      child_pid_present: Boolean(child.pid),
      production_deploy_performed: false,
      secrets_printed: false,
    }));
    await terminate("SIGTERM");
    process.exit(128);
  });
}

while (!exit) {
  if (await exists(stopFile)) {
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_SAFE_LEASE_CHILD_PRE_RELEASE_STOP",
      contract: CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
      child_pid_present: Boolean(child.pid),
      production_deploy_performed: false,
      secrets_printed: false,
    }));
    await terminate("SIGTERM");
    process.exit(128);
  }
  await sleep(50);
}
await mark(ackFile, `completed:${new Date().toISOString()}`);
if (exit.signal) process.exit(128);
process.exit(Number.isInteger(exit.code) ? exit.code : 1);
