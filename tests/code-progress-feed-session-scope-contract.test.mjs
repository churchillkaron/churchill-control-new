import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAILiveProgressRuntime.js", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/operator/code/progress/route.js", import.meta.url), "utf8");
const feed = await readFile(new URL("../components/operator/CodeProgressFeedProvider.jsx", import.meta.url), "utf8");
const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");

test("live Code progress carries exact DEVICE session scope", () => {
  assert.match(source, /const objectiveContext = object\(source\.objective_context\)/);
  assert.match(source, /device_session_id: text\(source\.device_session_id/);
  assert.match(source, /text\(objectiveContext\.device_session_id/);
  assert.match(source, /device_id: text\(source\.device_id/);
});

test("Developer Mode progress persistence and polling are keyed by device session", () => {
  assert.match(source, /function memoryKey\(actor, deviceSessionId = null\)/);
  assert.match(source, /device-session::\$\{session\}/);
  assert.match(source, /memoryKey\(actor, deviceSessionId\)/);
  assert.match(source, /loadCodeAILiveProgress\(\{ context = \{\}, device_session_id = null \}/);
  assert.match(route, /deviceSessionId/);
  assert.match(route, /device_session_id: deviceSessionId/);
  assert.match(feed, /deviceSessionScope/);
  assert.match(feed, /deviceSessionId=\$\{encodeURIComponent\(deviceSessionScope\)\}/);
  assert.match(ide, /setDeviceSessionScope\(session\?\.session_id \|\| null\)/);
});
