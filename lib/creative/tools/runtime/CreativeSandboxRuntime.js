import { Sandbox } from "@vercel/sandbox";

const CONTRACT = "CREATIVE_SANDBOX_RUNTIME_V3";

const TOOL_BOOTSTRAPS = Object.freeze({
  remotion: [
    {
      cmd: "bash",
      args: [
        "-lc",
        "mkdir -p /tmp/avantiqo-remotion && cd /tmp/avantiqo-remotion && npm init -y >/dev/null 2>&1 && npm install --no-audit --no-fund remotion @remotion/renderer @remotion/bundler",
      ],
    },
    {
      cmd: "bash",
      args: [
        "-lc",
        "cd /tmp/avantiqo-remotion && node -e \"console.log(require('remotion/package.json').version)\"",
      ],
    },
  ],
  "chromium-playwright": [
    {
      cmd: "bash",
      args: [
        "-lc",
        "mkdir -p /tmp/avantiqo-browser && cd /tmp/avantiqo-browser && npm init -y >/dev/null 2>&1 && npm install --no-audit --no-fund playwright",
      ],
    },
    {
      cmd: "bash",
      args: [
        "-lc",
        "cd /tmp/avantiqo-browser && npx playwright install chromium",
      ],
    },
    {
      cmd: "bash",
      args: [
        "-lc",
        "cd /tmp/avantiqo-browser && node -e \"console.log(require('playwright/package.json').version)\"",
      ],
    },
  ],
  blender: [
    {
      cmd: "dnf",
      args: ["install", "-y", "blender"],
      sudo: true,
    },
    {
      cmd: "blender",
      args: ["--version"],
    },
  ],
  opencv: [
    {
      cmd: "python3",
      args: [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-cache-dir",
        "numpy",
        "opencv-python-headless",
      ],
    },
    {
      cmd: "python3",
      args: ["-c", "import cv2; print(cv2.__version__)"],
    },
  ],
  imagemagick: [
    {
      cmd: "dnf",
      args: ["install", "-y", "ImageMagick"],
      sudo: true,
    },
    {
      cmd: "convert",
      args: ["-version"],
    },
  ],
});

function text(value) {
  return String(value ?? "").trim();
}

async function streamText(stream) {
  if (typeof stream === "function") {
    return text(await stream());
  }
  return text(stream);
}

async function normalizeResult(result) {
  return {
    exit_code: Number(result?.exitCode ?? -1),
    stdout: await streamText(result?.stdout),
    stderr: await streamText(result?.stderr),
  };
}

async function runStep(sandbox, step) {
  const command = step.sudo === true ? "sudo" : step.cmd;
  const args = step.sudo === true
    ? [step.cmd, ...(step.args || [])]
    : (step.args || []);

  const result = await sandbox.runCommand(command, args);
  const normalized = await normalizeResult(result);

  if (normalized.exit_code !== 0) {
    const error = new Error(
      `CREATIVE_SANDBOX_BOOTSTRAP_FAILED:${step.cmd}:${normalized.exit_code}`,
    );
    error.details = normalized;
    throw error;
  }

  return normalized;
}

async function stopQuietly(sandbox) {
  try {
    await sandbox?.stop?.();
  } catch {
    // Snapshot creation can stop the sandbox automatically.
  }
}

export async function createCreativeSandbox({
  timeout_ms = 600000,
  network_policy = "allow-all",
  runtime = "node24",
} = {}) {
  return Sandbox.create({
    timeout: timeout_ms,
    runtime,
    networkPolicy: network_policy,
  });
}

export async function verifyCreativeSandbox() {
  const sandbox = await createCreativeSandbox({ timeout_ms: 120000 });
  try {
    const node = await runStep(sandbox, {
      cmd: "node",
      args: ["--version"],
    });
    const python = await runStep(sandbox, {
      cmd: "python3",
      args: ["--version"],
    });
    return {
      contract: CONTRACT,
      sandbox_id: sandbox.sandboxId,
      ready: true,
      node: node.stdout || node.stderr,
      python: python.stdout || python.stderr,
    };
  } finally {
    await stopQuietly(sandbox);
  }
}

export async function bootstrapCreativeSandboxTool({
  tool_id,
  create_snapshot = true,
  snapshot_expiration_ms = 0,
} = {}) {
  const toolId = text(tool_id).toLowerCase();
  const steps = TOOL_BOOTSTRAPS[toolId];
  if (!steps) {
    throw new Error(`CREATIVE_SANDBOX_TOOL_NOT_REGISTERED:${toolId}`);
  }

  const sandbox = await createCreativeSandbox();
  let snapshotted = false;

  try {
    const results = [];
    for (const step of steps) {
      results.push(await runStep(sandbox, step));
    }

    let snapshotId = null;
    if (create_snapshot) {
      const snapshot = await sandbox.snapshot({
        expiration: snapshot_expiration_ms,
      });
      snapshotId = snapshot?.snapshotId || null;
      snapshotted = true;
    }

    return {
      contract: CONTRACT,
      sandbox_id: sandbox.sandboxId,
      tool_id: toolId,
      ready: true,
      snapshot_id: snapshotId,
      steps: results,
    };
  } finally {
    if (!snapshotted) {
      await stopQuietly(sandbox);
    }
  }
}

export async function createCreativeSandboxFromSnapshot({
  snapshot_id,
  timeout_ms = 600000,
  network_policy = "deny-all",
} = {}) {
  const snapshotId = text(snapshot_id);
  if (!snapshotId) {
    throw new Error("CREATIVE_SANDBOX_SNAPSHOT_REQUIRED");
  }

  return Sandbox.create({
    timeout: timeout_ms,
    networkPolicy: network_policy,
    source: {
      type: "snapshot",
      snapshotId,
    },
  });
}

export const CreativeSandboxRuntime = Object.freeze({
  contract: CONTRACT,
  registered_tools: Object.keys(TOOL_BOOTSTRAPS),
  create: createCreativeSandbox,
  verify: verifyCreativeSandbox,
  bootstrapTool: bootstrapCreativeSandboxTool,
  fromSnapshot: createCreativeSandboxFromSnapshot,
});
