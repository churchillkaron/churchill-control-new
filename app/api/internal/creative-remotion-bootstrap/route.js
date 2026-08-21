export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

const TOKEN = "avq-remotion-bootstrap-20260821";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "37ca49f2-210d-4665-af6b-6b5fa834f750";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

async function loadProject() {
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CREATIVE_PROJECT_NOT_FOUND");
  return data;
}

async function persistSnapshot(project, snapshotId) {
  const metadata = project.metadata || {};
  const snapshots = metadata.creative_tool_snapshots || {};
  const next = {
    ...snapshots,
    remotion: {
      tool_id: "remotion",
      snapshot_id: snapshotId,
      sandbox_contract: CreativeSandboxRuntime.contract,
      ready: true,
      browser_baked: true,
      verified_at: new Date().toISOString(),
    },
  };
  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({
      metadata: {
        ...metadata,
        creative_tool_snapshots: next,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
  return next.remotion;
}

async function bootstrapRemotionWithBrowser(project) {
  const sandbox = await CreativeSandboxRuntime.create({
    timeout_ms: 900000,
    network_policy: "allow-all",
  });
  let snapshotted = false;
  try {
    await CreativeSandboxRuntime.run({
      sandbox,
      cmd: "bash",
      args: [
        "-lc",
        "rm -rf /tmp/avantiqo-remotion && mkdir -p /tmp/avantiqo-remotion && cd /tmp/avantiqo-remotion && npm init -y >/dev/null 2>&1 && npm install --no-audit --no-fund react react-dom remotion @remotion/renderer @remotion/bundler @remotion/cli && ./node_modules/.bin/remotion browser ensure && node -e \"console.log(require('remotion/package.json').version)\"",
      ],
      timeout_ms: 780000,
      error_prefix: "CREATIVE_REMOTION_BROWSER_BOOTSTRAP_FAILED",
    });

    const verify = await CreativeSandboxRuntime.run({
      sandbox,
      cmd: "bash",
      args: [
        "-lc",
        "cd /tmp/avantiqo-remotion && find node_modules/.remotion -type f \\( -name 'chrome-headless-shell' -o -name 'headless_shell' \\) | head -n 3",
      ],
      timeout_ms: 30000,
      error_prefix: "CREATIVE_REMOTION_BROWSER_VERIFY_FAILED",
    });
    if (!String(verify.stdout || "").trim()) {
      throw new Error("CREATIVE_REMOTION_BROWSER_BINARY_MISSING");
    }

    const snapshot = await sandbox.snapshot({ expiration: 0 });
    const snapshotId = snapshot?.id || snapshot?.snapshotId || snapshot?.snapshot?.id || null;
    if (!snapshotId) throw new Error("CREATIVE_REMOTION_SNAPSHOT_ID_MISSING");
    snapshotted = true;
    const persisted = await persistSnapshot(project, snapshotId);
    return {
      snapshot_id: snapshotId,
      browser_baked: true,
      browser_binary: String(verify.stdout || "").trim().split("\n")[0],
      persisted,
    };
  } finally {
    if (!snapshotted) await CreativeSandboxRuntime.stop(sandbox);
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = url.searchParams.get("action") || "status";
    const project = await loadProject();

    if (action === "status") {
      return json({
        success: true,
        remotion: project.metadata?.creative_tool_snapshots?.remotion || null,
      });
    }

    if (action === "bootstrap") {
      const result = await bootstrapRemotionWithBrowser(project);
      return json({ success: true, ...result });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({
      success: false,
      error: error?.message || String(error),
      details: error?.details || null,
    }, 500);
  }
}
