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

async function persistSnapshot(project, snapshotId, browserBinary) {
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
      browser_dependencies_baked: true,
      browser_binary: browserBinary || null,
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
    const install = await CreativeSandboxRuntime.run({
      sandbox,
      cmd: "bash",
      args: [
        "-lc",
        "set -e; apt-get update >/dev/null; DEBIAN_FRONTEND=noninteractive apt-get install -y libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libatspi2.0-0 libx11-xcb1 libxshmfence1 fonts-liberation >/dev/null; rm -rf /tmp/avantiqo-remotion; mkdir -p /tmp/avantiqo-remotion; cd /tmp/avantiqo-remotion; npm init -y >/dev/null 2>&1; npm install --no-audit --no-fund react react-dom remotion @remotion/renderer @remotion/bundler @remotion/cli; ./node_modules/.bin/remotion browser ensure; BROWSER=$(find node_modules/.remotion -type f \\( -name 'chrome-headless-shell' -o -name 'headless_shell' \\) | head -n 1); test -n \"$BROWSER\"; ldd \"$BROWSER\" | grep 'not found' && exit 21 || true; printf '\nBROWSER_BINARY=%s\n' \"$BROWSER\"; node -e \"console.log('REMOTION_VERSION='+require('remotion/package.json').version)\"",
      ],
      timeout_ms: 780000,
      error_prefix: "CREATIVE_REMOTION_BROWSER_BOOTSTRAP_FAILED",
    });

    const match = String(install.stdout || "").match(/BROWSER_BINARY=([^\r\n]+)/);
    const browserBinary = match?.[1]?.trim() || null;
    if (!browserBinary) throw new Error("CREATIVE_REMOTION_BROWSER_BINARY_MISSING");

    const snapshot = await sandbox.snapshot({ expiration: 0 });
    const snapshotId = snapshot?.id || snapshot?.snapshotId || snapshot?.snapshot?.id || null;
    if (!snapshotId) throw new Error("CREATIVE_REMOTION_SNAPSHOT_ID_MISSING");
    snapshotted = true;
    const persisted = await persistSnapshot(project, snapshotId, browserBinary);
    return {
      snapshot_id: snapshotId,
      browser_baked: true,
      browser_dependencies_baked: true,
      browser_binary: browserBinary,
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
