import process from "node:process";
import { spawn } from "node:child_process";
import {
  CHILD_TERMINATION_GRACE_MS,
  CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
} from "../lib/code/runtime/CodeAICertificationResiliencePolicy.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

let exit = null;
child.on("exit", (code, signal) => {
  exit = { code, signal };
});

async function terminate(signal = "SIGTERM") {
  if (exit) return;
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
  }
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

while (!exit) await sleep(50);
if (exit.signal) process.exit(128);
process.exit(Number.isInteger(exit.code) ? exit.code : 1);
