import { Sandbox } from "@vercel/sandbox";

const CONTRACT = "CREATIVE_SANDBOX_RUNTIME_V4";
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
        "--user",
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

function assertSafeJobPath(value) {
  const path = text(value);
  if (!path.startsWith(SAFE_JOB_PREFIX) || path.includes("..")) {
    throw new Error(`CREATIVE_SANDBOX_UNSAFE_JOB_PATH:${path}`);
  }
  return path;
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

export async function runCreativeSandboxCommand({
  sandbox,
  cmd,
  args = [],
  sudo = false,
  cwd = null,
  error_prefix = "CREATIVE_SANDBOX_COMMAND_FAILED",
} = {}) {
  if (!sandbox) throw new Error("CREATIVE_SANDBOX_REQUIRED");
  const command = sudo ? "sudo" : text(cmd);
  const commandArgs = sudo
    ? [text(cmd), ...args.map((value) => String(value))]
    : args.map((value) => String(value));

  const executionArgs = cwd
    ? [
        "bash",
        [
          "-lc",
          "cd -- \"$1\" && shift && exec \"$@\"",
          "avantiqo",
          text(cwd),
          command,
          ...commandArgs,
        ],
      ]
    : [command, commandArgs];

  const result = await sandbox.runCommand(executionArgs[0], executionArgs[1]);
  const normalized = await normalizeResult(result);

  if (normalized.exit_code !== 0) {
    const error = new Error(
      `${error_prefix}:${text(cmd)}:${normalized.exit_code}`,
    );
    error.details = normalized;
    throw error;
  }

  return normalized;
}

export async function writeCreativeSandboxText({
  sandbox,
  path,
  content,
} = {}) {
  const target = assertSafeJobPath(path);
  const encoded = Buffer.from(String(content ?? ""), "utf8").toString("base64");

  return runCreativeSandboxCommand({
    sandbox,
    cmd: "bash",
    args: [
      "-lc",
      "mkdir -p \"$(dirname -- \"$1\")\" && printf '%s' \"$2\" | base64 --decode > \"$1\"",
      "avantiqo",
      target,
      encoded,
    ],
    error_prefix: "CREATIVE_SANDBOX_WRITE_FAILED",
  });
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
    return {
      contract: CONTRACT,
      sandbox_id: sandbox.sandboxId || sandbox.id || null,
      ready: true,
      node: node.stdout || node.stderr,
      python: python.stdout || python.stderr,
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
        error_prefix: "CREATIVE_SANDBOX_BOOTSTRAP_FAILED",
      }));
    }

    let snapshotId = null;
    if (create_snapshot) {
      const snapshot = await sandbox.snapshot({
        expiration: snapshot_expiration_ms,
      });
      snapshotId =
        snapshot?.snapshotId ||
        snapshot?.id ||
        snapshot?.snapshot?.id ||
        null;
      if (!snapshotId) {
        throw new Error("CREATIVE_SANDBOX_SNAPSHOT_ID_MISSING");
      }
      snapshotted = true;
    }

    return {
      contract: CONTRACT,
      sandbox_id: sandbox.sandboxId || sandbox.id || null,
      tool_id: toolId,
      ready: true,
      snapshot_id: snapshotId,
      steps: results,
    };
  } finally {
    if (!snapshotted) {
      await stopCreativeSandbox(sandbox);
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
  run: runCreativeSandboxCommand,
  writeText: writeCreativeSandboxText,
  readBuffer: readCreativeSandboxBuffer,
  stop: stopCreativeSandbox,
});
