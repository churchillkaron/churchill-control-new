import { CodeWorkspaceRuntime } from "@/lib/code/runtime/CodeWorkspaceRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export const runtime = "nodejs";
export const maxDuration = 300;
const REQUIRED_PERMISSION = "platform.code.ai.execute";
const ACTIONS = new Set(["open", "attach", "state", "tree", "read", "lease", "write", "run", "diff", "browser", "close"]);

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function responseError(message, status = 400) {
  return Response.json({ success: false, error: text(message, 1000) }, { status });
}

async function attachWorkspace({ organizationId, body }) {
  const deviceId = text(body.device_id, 160);
  const sessionId = text(body.session_id, 160);
  if (!deviceId || !sessionId) throw new Error("CODE_IDE_DEVICE_SESSION_REQUIRED");
  return CodeWorkspaceRuntime.open({
    workspace_target: "DEVICE",
    organization_id: organizationId,
    device_id: deviceId,
    session_id: sessionId,
    timeout_ms: Math.max(30000, Math.min(Number(body.timeout_ms) || 120000, 300000)),
  });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id, 200);
    const action = text(body.action, 80).toLowerCase();
    if (!organizationId || !ACTIONS.has(action)) return responseError("organizationId and valid action required");
    const access = await requireOrganizationAccess({ organizationId, request, requiredPermission: REQUIRED_PERMISSION });
    if (!access.success) return responseError(access.error, access.status || 403);

    if (action === "open") {
      const deviceId = text(body.device_id, 160);
      const repositoryUrl = text(body.repository_url, 1000);
      if (!deviceId || !repositoryUrl) return responseError("device_id and repository_url required");
      const workspace = await CodeWorkspaceRuntime.open({
        workspace_target: "DEVICE",
        organization_id: organizationId,
        device_id: deviceId,
        repository_url: repositoryUrl,
        ref: text(body.ref, 160) || "main",
        timeout_ms: Math.max(30000, Math.min(Number(body.timeout_ms) || 180000, 300000)),
      });
      const [inspection, tree, ideState] = await Promise.all([workspace.inspect(), workspace.fileTree(), workspace.ideState()]);
      return Response.json({ success: true, result: {
        session_id: workspace.session_id,
        device_id: workspace.device_id,
        device_name: workspace.device_name,
        repository_root: workspace.repository_root || null,
        source_repository_root: workspace.source_repository_root || null,
        repository_url: workspace.repository_url,
        ref: workspace.ref,
        base_commit: workspace.base_commit,
        inspection,
        tree,
        ide_state: ideState,
      }});
    }

    const hotReadOnlyAction = ["state", "tree", "read", "diff", "lease"].includes(action);
    const workspaceTimeoutMs = hotReadOnlyAction
      ? Math.max(3000, Math.min(Number(body.timeout_ms) || 15000, 20000))
      : Math.max(10000, Math.min(Number(body.timeout_ms) || 60000, 120000));
    const workspace = action === "attach"
      ? await attachWorkspace({ organizationId, body })
      : await CodeWorkspaceRuntime.bind({
          workspace_target: "DEVICE",
          organization_id: organizationId,
          device_id: text(body.device_id, 160),
          session_id: text(body.session_id, 160),
          timeout_ms: workspaceTimeoutMs,
        });
    if (action === "attach") {
      const [inspection, tree, ideState] = await Promise.all([workspace.inspect(), workspace.fileTree(), workspace.ideState()]);
      return Response.json({ success: true, result: { session_id: workspace.session_id, repository_root: workspace.repository_root || null, source_repository_root: workspace.source_repository_root || null, repository_url: workspace.repository_url, ref: workspace.ref, base_commit: workspace.base_commit, inspection, tree, ide_state: ideState } });
    }
    if (action === "state") return Response.json({ success: true, result: await workspace.ideState() });
    if (action === "tree") return Response.json({ success: true, result: await workspace.fileTree() });
    if (action === "read") return Response.json({ success: true, result: await workspace.read({ file_path: text(body.file_path, 2000), start_line: 1, end_line: 1000000 }) });
    if (action === "lease") {
      const owner = text(body.owner, 40).toUpperCase() || "HUMAN";
      const result = body.release === true
        ? await workspace.releaseEditLease({ owner })
        : await workspace.acquireEditLease({ owner, ttl_ms: body.ttl_ms || 120000 });
      return Response.json({ success: true, result });
    }
    if (action === "write") {
      const result = await workspace.ideWrite({
        file_path: text(body.file_path, 2000),
        content: String(body.content ?? ""),
        expected_revision: body.expected_revision,
        owner: "HUMAN",
      });
      return Response.json({ success: true, result });
    }
    if (action === "run") {
      await workspace.acquireEditLease({ owner: "HUMAN", ttl_ms: Math.max(120000, Math.min(Number(body.command_timeout_ms) || 120000, 300000)) });
      const result = await workspace.run({
        command: text(body.command, 160),
        args: list(body.args).map(String).slice(0, 80),
        cwd: text(body.cwd, 1000) || ".",
        timeout_ms: Math.max(1000, Math.min(Number(body.command_timeout_ms) || 120000, 300000)),
        actor: "HUMAN",
      });
      return Response.json({ success: true, result });
    }
    if (action === "diff") return Response.json({ success: true, result: await workspace.diff() });
    if (action === "browser") return Response.json({ success: true, result: await workspace.browserVerify(body.input || {}) });
    if (action === "close") {
      await workspace.stop();
      return Response.json({ success: true, result: { stopped: true } });
    }
    return responseError("Unsupported action");
  } catch (error) {
    const message = text(error?.message || error, 1000);
    const status = /REQUIRED|INVALID|UNSUPPORTED|CONFLICT|LEASE/.test(message) ? 409 : 500;
    return responseError(message, status);
  }
}
