import { Sandbox } from "@vercel/sandbox";

// Production activation: completion-safe V7 sandbox rendering.
const CONTRACT = "CREATIVE_SANDBOX_RUNTIME_V6";
const SAFE_JOB_PREFIX = "/tmp/avantiqo-";

const TOOL_BOOTSTRAPS = Object.freeze({
  remotion: [
    {
      cmd: "bash",
      args: [
        "-lc",
        "mkdir -p /tmp/avantiqo-remotion && cd /tmp/avantiqo-remotion && npm init -y >/dev/null 2>&1 && npm install --no-audit --no-fund react react-dom remotion @remotion/renderer @remotion/bundler",
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
      cmd: "npx",
      args: ["playwright", "install-deps", "chromium"],
      cwd: "/tmp/avantiqo-browser",
      sudo: true,
    },
    {
      cmd: "npx",
      args: ["playwright", "install", "chromium"],
      cwd: "/tmp/avantiqo-browser",
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
      cmd: "apt-get",
      args: ["update"],
      sudo: true,
    },
    {
      cmd: "apt-get",
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
      cmd: "bash",
      args: [
        "-lc",
        "rm -rf /tmp/avantiqo-opencv && python3 -m venv /tmp/avantiqo-opencv/venv && /tmp/avantiqo-opencv/venv/bin/pip install --disable-pip-version-check --no-cache-dir numpy opencv-python-headless",
      ],
    },
    {
      cmd: "/tmp/avantiqo-opencv/venv/bin/python",
      args: ["-c", "import cv2; print(cv2.__version__)"],
    },
  ],
  imagemagick: [
    {
      cmd: "apt-get",
      args: ["update"],
      sudo: true,
    },
    {
      cmd: "apt-get",
      args: ["install", "-y", "imagemagick"],
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

function assertSafeJobPath(value) {
  const path = text(value);
  if (!path.startsWith(SAFE_JOB_PREFIX) || path.includes("..")) {
    throw new Error(`CREATIVE_SANDBOX_UNSAFE_JOB_PATH:${path}`);
  }
  return path;
}

async function commandOutput(result, field) {
  const value = result?.[field];
  if (typeof value === "function") return text(await value.call(result));
  return text(value);
}

async function directCommand({
  sandbox,
  cmd,
  args = [],
  cwd = null,
  sudo = false,
} = {}) {
  const result = await sandbox.runCommand({
    cmd: text(cmd),
    args: args.map((value) => String(value)),
    ...(text(cwd) ? { cwd: text(cwd) } : {}),
    ...(sudo === true ? { sudo: true } : {}),
  });

  const exitCode = Number(result?.exitCode);
  if (!Number.isFinite(exitCode)) {
    throw new Error("CREATIVE_SANDBOX_COMMAND_FINISH_MISSING");
  }

  return {
    exit_code: exitCode,
    stdout: await commandOutput(result, "stdout"),
    stderr: await commandOutput(result, "stderr"),
  };
}

export async function runCreativeSandboxCommand({
  sandbox,
  cmd,
  args = [],
  sudo = false,
  cwd = null,
  timeout_ms = null,
  error_prefix = "CREATIVE_SANDBOX_COMMAND_FAILED",
} = {}) {
  if (!sandbox) throw new Error("CREATIVE_SANDBOX_REQUIRED");
  const command = text(cmd);
  if (!command) throw new Error("CREATIVE_SANDBOX_COMMAND_REQUIRED");

  const normalized = await directCommand({
    sandbox,
    cmd: command,
    args,
    sudo,
    cwd,
    timeout_ms,
  });

  if (normalized.exit_code !== 0) {
    const error = new Error(`${error_prefix}:${command}:${normalized.exit_code}`);
    error.details = normalized;
    throw error;
  }

  return normalized;
}

export async function writeCreativeSandboxText({ sandbox, path, content } = {}) {
  if (!sandbox) throw new Error("CREATIVE_SANDBOX_REQUIRED");
  const target = assertSafeJobPath(path);
  const parent = target.slice(0, target.lastIndexOf("/"));

  if (parent) {
    await runCreativeSandboxCommand({
      sandbox,
      cmd: "mkdir",
      args: ["-p", parent],
      error_prefix: "CREATIVE_SANDBOX_MKDIR_FAILED",
    });
  }

  await sandbox.writeFiles([
    {
      path: target,
      content: Buffer.from(String(content ?? ""), "utf8"),
    },
  ]);

  return { path: target };
}

export async function readCreativeSandboxBuffer({ sandbox, path } = {}) {
  if (!sandbox) throw new Error("CREATIVE_SANDBOX_REQUIRED");
  const target = assertSafeJobPath(path);
  const buffer = await sandbox.readFileToBuffer({ path: target });
  if (!buffer) throw new Error(`CREATIVE_SANDBOX_OUTPUT_MISSING:${target}`);
  return buffer;
}

export async function stopCreativeSandbox(sandbox) {
  try {
    await sandbox?.stop?.();
  } catch {
    // Snapshot creation stops the current session automatically.
  }
}

export async function createCreativeSandbox({
  timeout_ms = 600000,
  network_policy = "allow-all",
  image = null,
} = {}) {
  return Sandbox.create({
    timeout: timeout_ms,
    networkPolicy: network_policy,
    ...(text(image) ? { image: text(image) } : {}),
  });
}

export async function verifyCreativeSandbox() {
  const sandbox = await createCreativeSandbox({ timeout_ms: 120000 });
  try {
    const node = await runCreativeSandboxCommand({
      sandbox,
      cmd: "node",
      args: ["--version"],
      error_prefix: "CREATIVE_SANDBOX_VERIFY_FAILED",
    });
    const python = await runCreativeSandboxCommand({
      sandbox,
      cmd: "python3",
      args: ["--version"],
      error_prefix: "CREATIVE_SANDBOX_VERIFY_FAILED",
    });
    const os = await runCreativeSandboxCommand({
      sandbox,
      cmd: "bash",
      args: ["-lc", "source /etc/os-release && printf '%s %s' \"$ID\" \"$VERSION_ID\""],
      error_prefix: "CREATIVE_SANDBOX_VERIFY_FAILED",
    });
    return {
      contract: CONTRACT,
      sandbox_id: sandbox.name || sandbox.id || sandbox.sandboxId || null,
      ready: true,
      node: node.stdout || node.stderr,
      python: python.stdout || python.stderr,
      os: os.stdout || os.stderr,
    };
  } finally {
    await stopCreativeSandbox(sandbox);
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

  const sandbox = await createCreativeSandbox({ timeout_ms: 900000 });
  let snapshotted = false;

  try {
    const results = [];
    for (const step of steps) {
      results.push(await runCreativeSandboxCommand({
        sandbox,
        cmd: step.cmd,
        args: step.args || [],
        sudo: step.sudo === true,
        cwd: step.cwd || null,
        timeout_ms: 600000,
        error_prefix: "CREATIVE_SANDBOX_BOOTSTRAP_FAILED",
      }));
    }

    let snapshotId = null;
    if (create_snapshot) {
      const snapshot = await sandbox.snapshot({ expiration: snapshot_expiration_ms });
      snapshotId = snapshot?.id || snapshot?.snapshotId || snapshot?.snapshot?.id || null;
      if (!snapshotId) throw new Error("CREATIVE_SANDBOX_SNAPSHOT_ID_MISSING");
      snapshotted = true;
    }

    return {
      contract: CONTRACT,
      sandbox_id: sandbox.name || sandbox.id || sandbox.sandboxId || null,
      tool_id: toolId,
      ready: true,
      snapshot_id: snapshotId,
      steps: results,
    };
  } finally {
    if (!snapshotted) await stopCreativeSandbox(sandbox);
  }
}

export async function createCreativeSandboxFromSnapshot({
  snapshot_id,
  timeout_ms = 600000,
  network_policy = "deny-all",
} = {}) {
  const snapshotId = text(snapshot_id);
  if (!snapshotId) throw new Error("CREATIVE_SANDBOX_SNAPSHOT_REQUIRED");

  return Sandbox.create({
    timeout: timeout_ms,
    networkPolicy: network_policy,
    source: { type: "snapshot", snapshotId },
  });
}

export const CreativeSandboxRuntime = Object.freeze({
  contract: CONTRACT,
  registered_tools: Object.keys(TOOL_BOOTSTRAPS),
  create: createCreativeSandbox,
  verify: verifyCreativeSandbox,
  bootstrapTool: bootstrapCreativeSandboxTool,
  fromSnapshot: createCreativeSandboxFromSnapshot,
  run: runCreativeSandboxCommand,
  writeText: writeCreativeSandboxText,
  readBuffer: readCreativeSandboxBuffer,
  stop: stopCreativeSandbox,
});
