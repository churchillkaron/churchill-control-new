import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const router = await readFile(new URL("../lib/code/runtime/CodeWorkspaceRuntime.js", import.meta.url), "utf8");
const device = await readFile(new URL("../lib/code/runtime/CodeWorkspaceDeviceRuntime.js", import.meta.url), "utf8");
const mission = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");
const agent = await readFile(new URL("../scripts/code-device-agent.mjs", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260920123000_avantiqo_code_devices.sql", import.meta.url), "utf8");
const studio = await readFile(new URL("../components/creative/code/CreativeCodeStudio.jsx", import.meta.url), "utf8");
const devicesRoute = await readFile(new URL("../app/api/operator/code/devices/route.js", import.meta.url), "utf8");

test("Code workspace router supports organization-bound devices", () => {
  assert.match(router, /"DEVICE"/);
  assert.match(router, /CodeWorkspaceDeviceRuntime/);
  assert.match(device, /\.eq\("organization_id", organizationId\)/);
  assert.match(device, /CODE_AI_DEVICE_OFFLINE/);
  assert.doesNotMatch(device, /metrics,node_id,device_id/);
  assert.match(device, /status,result,error_code,metrics,device_id/);
});

test("Code mission accepts explicit connected-computer routing", () => {
  assert.match(mission, /workspace_target/);
  assert.match(mission, /device_id/);
  assert.match(mission, /CODE_STUDIO_DEVICE_ID_REQUIRED/);
});

test("device agent blocks direct external side effects", () => {
  assert.match(agent, /CODE_DEVICE_GIT_PUSH_REQUIRES_GOVERNED_COMMIT/);
  assert.match(agent, /CODE_DEVICE_EXTERNAL_SIDE_EFFECT_REQUIRES_GOVERNED_RUNTIME/);
  assert.match(agent, /CODE_DEVICE_PROTECTED_PATH/);
  assert.match(agent, /code\.browser\.verify/);
  assert.match(agent, /path\.basename\(text\(command,160\)\)\.toLowerCase\(\)/);
});

test("pairing and jobs remain organization and device scoped", () => {
  assert.match(migration, /organization_id uuid not null/);
  assert.match(migration, /pair_avantiqo_code_device/);
  assert.match(migration, /j\.device_id=p_device_id/);
  assert.match(migration, /used_at is null and expires_at > now\(\)/);
});


test("Code Studio exposes connected-computer state and keeps delivery governed", () => {
  assert.match(studio, /Connected computer/);
  assert.match(studio, /\/api\/operator\/code\/devices/);
  assert.match(studio, /device\.online \? "online" : "offline"/);
  assert.match(studio, /workspace_target: workspaceTarget/);
  assert.match(studio, /device_id: workspaceTarget === "DEVICE" \? deviceId : null/);
  assert.match(studio, /\/api\/operator\/code\/commit/);
  assert.match(studio, /\/api\/operator\/code\/release/);
  assert.match(devicesRoute, /requiredPermission: REQUIRED_PERMISSION/);
  assert.match(devicesRoute, /\.eq\("organization_id", organizationId\)/);
});
