import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const CONTRACT = "AVANTIQO_VOICE_REALTIME_RELAY_SAFE_LEASE_PATCH_V1";
const RELAY_PATH = "supabase/functions/avantiqo-voice-realtime-relay/index.ts";
const SAFE_LEASE_IMPORT = `import {\n  acquireVoiceRealtimeSafeLease,\n  realtimeEndpointIdFromWebSocketUrl,\n} from "../_shared/avantiqo-voice-realtime-safe-lease.ts";\n`;

function exactOnce(source, needle, code) {
  const first = source.indexOf(needle);
  const last = source.lastIndexOf(needle);
  if (first < 0 || first !== last) throw new Error(`${CONTRACT}_${code}`);
}

function replaceOnce(source, needle, replacement, code) {
  exactOnce(source, needle, code);
  return source.replace(needle, replacement);
}

function assertForbidden(source) {
  for (const pattern of [/\/run\b/, /\/health\b/, /purge-queue/]) {
    if (pattern.test(source)) throw new Error(`${CONTRACT}_QUEUE_API_FORBIDDEN`);
  }
}

try {
  const original = await readFile(RELAY_PATH, "utf8");
  if (original.includes(SAFE_LEASE_IMPORT.trim())) {
    console.log(JSON.stringify({
      success: true,
      contract: CONTRACT,
      changed: false,
      relay_path: RELAY_PATH,
      safe_lease_bound: true,
      gpu_started: false,
      generation_submitted: false,
      production_deploy_performed: false,
      production_migration_applied: false,
      production_function_deployed: false,
    }, null, 2));
    process.exit(0);
  }

  assertForbidden(original);

  const importAnchor = `import { createClient } from "npm:@supabase/supabase-js@2.95.0";\n`;
  const serveAnchor = `Deno.serve(async (request) => {\n`;
  const setupAnchor = `    const runpodUrl = upstreamUrl();\n    const runpodKey = runpodApiKey();\n    const sessionId = crypto.randomUUID();\n    const sessionStart = await signedSessionStart({\n      organizationId,\n      sessionId,\n      language,\n    });\n\n    const { socket: client, response } = Deno.upgradeWebSocket(request, {\n`;
  const stateAnchor = `    let openTimer: number | null = null;\n    let sessionTimer: number | null = null;\n`;
  const finishAnchor = `    const finish = (code = 1000, reason = "complete") => {\n      if (closed) return;\n      closed = true;\n      if (openTimer !== null) clearTimeout(openTimer);\n      if (sessionTimer !== null) clearTimeout(sessionTimer);\n      try {\n        if (client.readyState === WebSocket.OPEN) client.close(code, reason);\n      } catch {}\n      try {\n        if (upstream?.readyState === WebSocket.OPEN) upstream.close(code, reason);\n      } catch {}\n      upstream = null;\n      resolveClosed?.();\n      resolveClosed = null;\n    };\n`;
  const openAnchor = `    client.addEventListener("open", () => {\n      sendClient({\n`;
  const catchAnchor = `  } catch (error) {\n    const message = text(error instanceof Error ? error.message : error);\n`;

  for (const [needle, code] of [
    [importAnchor, "IMPORT_ANCHOR_CHANGED"],
    [serveAnchor, "SERVE_ANCHOR_CHANGED"],
    [setupAnchor, "SETUP_ANCHOR_CHANGED"],
    [stateAnchor, "STATE_ANCHOR_CHANGED"],
    [finishAnchor, "FINISH_ANCHOR_CHANGED"],
    [openAnchor, "OPEN_ANCHOR_CHANGED"],
    [catchAnchor, "CATCH_ANCHOR_CHANGED"],
  ]) exactOnce(original, needle, code);

  let next = original;
  next = replaceOnce(
    next,
    importAnchor,
    `${importAnchor}${SAFE_LEASE_IMPORT}`,
    "IMPORT_ANCHOR_CHANGED",
  );
  next = replaceOnce(
    next,
    serveAnchor,
    `${serveAnchor}  let realtimeLease: Awaited<ReturnType<typeof acquireVoiceRealtimeSafeLease>> | null = null;\n`,
    "SERVE_ANCHOR_CHANGED",
  );
  next = replaceOnce(
    next,
    setupAnchor,
    `    const runpodUrl = upstreamUrl();\n    const runpodKey = runpodApiKey();\n    const sessionId = crypto.randomUUID();\n    const sessionStart = await signedSessionStart({\n      organizationId,\n      sessionId,\n      language,\n    });\n\n    realtimeLease = await acquireVoiceRealtimeSafeLease({\n      organizationId,\n      endpointId: realtimeEndpointIdFromWebSocketUrl(runpodUrl),\n      ownerRequestId: sessionId,\n      ttlSeconds: 120,\n    });\n\n    const { socket: client, response } = Deno.upgradeWebSocket(request, {\n`,
    "SETUP_ANCHOR_CHANGED",
  );
  next = replaceOnce(
    next,
    stateAnchor,
    `    let openTimer: number | null = null;\n    let sessionTimer: number | null = null;\n    let leaseRefreshTimer: number | null = null;\n    let finishPromise: Promise<void> | null = null;\n`,
    "STATE_ANCHOR_CHANGED",
  );
  next = replaceOnce(
    next,
    finishAnchor,
    `    const finish = (code = 1000, reason = "complete") => {\n      if (finishPromise) return finishPromise;\n      finishPromise = (async () => {\n        if (closed) return;\n        closed = true;\n        if (openTimer !== null) clearTimeout(openTimer);\n        if (sessionTimer !== null) clearTimeout(sessionTimer);\n        if (leaseRefreshTimer !== null) clearInterval(leaseRefreshTimer);\n        try {\n          if (client.readyState === WebSocket.OPEN) client.close(code, reason);\n        } catch {}\n        try {\n          if (upstream?.readyState === WebSocket.OPEN) upstream.close(code, reason);\n        } catch {}\n        upstream = null;\n        const lease = realtimeLease;\n        realtimeLease = null;\n        if (lease) {\n          if (code === 1000) await lease.release(reason);\n          else await lease.fail(reason);\n        }\n        resolveClosed?.();\n        resolveClosed = null;\n      })();\n      return finishPromise;\n    };\n`,
    "FINISH_ANCHOR_CHANGED",
  );
  next = replaceOnce(
    next,
    openAnchor,
    `    client.addEventListener("open", () => {\n      leaseRefreshTimer = setInterval(() => {\n        const lease = realtimeLease;\n        if (!lease || closed) return;\n        void lease.refresh().catch(() => {\n          sendClient({\n            type: "relay.error",\n            contract: RELAY_CONTRACT,\n            code: "AVANTIQO_VOICE_REALTIME_SAFE_LEASE_REFRESH_FAILED",\n          });\n          void finish(1011, "safe lease refresh failed");\n        });\n      }, 30_000);\n\n      sendClient({\n`,
    "OPEN_ANCHOR_CHANGED",
  );
  next = replaceOnce(
    next,
    catchAnchor,
    `  } catch (error) {\n    const failedLease = realtimeLease;\n    realtimeLease = null;\n    if (failedLease) {\n      await failedLease.fail("relay setup failed").catch(() => null);\n    }\n    const message = text(error instanceof Error ? error.message : error);\n`,
    "CATCH_ANCHOR_CHANGED",
  );

  assertForbidden(next);
  for (const required of [
    "acquireVoiceRealtimeSafeLease",
    "realtimeEndpointIdFromWebSocketUrl(runpodUrl)",
    "ttlSeconds: 120",
    "lease.refresh()",
    "await lease.release(reason)",
    "await lease.fail(reason)",
    "await failedLease.fail(\"relay setup failed\")",
    "if (finishPromise) return finishPromise",
    "resolveClosed?.()",
  ]) {
    if (!next.includes(required)) throw new Error(`${CONTRACT}_OUTPUT_CONTRACT_INCOMPLETE`);
  }

  await writeFile(RELAY_PATH, next, "utf8");
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    changed: true,
    relay_path: RELAY_PATH,
    safe_lease_bound: true,
    queue_api_allowed: false,
    purge_queue_allowed: false,
    gpu_started: false,
    generation_submitted: false,
    production_deploy_performed: false,
    production_migration_applied: false,
    production_function_deployed: false,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    error: error?.message || String(error),
    changed: false,
    gpu_started: false,
    generation_submitted: false,
    production_deploy_performed: false,
    production_migration_applied: false,
    production_function_deployed: false,
  }, null, 2));
  process.exitCode = 1;
}
