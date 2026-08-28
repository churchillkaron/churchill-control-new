import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Video external paid fallback is explicit opt-in and never enabled by credential presence alone", async () => {
  const source = await readFile(
    new URL("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoCapacityRouter.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /AVANTIQO_VIDEO_EXTERNAL_PAID_FALLBACK_APPROVED/);
  assert.match(source, /AVANTIQO_VIDEO_MANAGED_FALLBACK_ENABLED/);
  assert.match(source, /externalPaidFallbackApproved[\s\S]*false/);
  assert.match(source, /managedFallbackEnabled[\s\S]*false/);
  assert.match(source, /if \(!externalPaidFallbackApproved\) return false/);
  assert.match(source, /if \(!managedFallbackEnabled\) return false/);
  assert.doesNotMatch(
    source,
    /AVANTIQO_VIDEO_MANAGED_FALLBACK_ENABLED, true/,
  );
});

test("owned Video global capacity inspector is read-only and covers all certified 80GB+ GPU families", async () => {
  const source = await readFile(
    new URL("../scripts/inspect-avantiqo-video-owned-global-capacity-v66-local.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /MIN_MEMORY_GB = 80/);
  assert.match(source, /RTX PRO 6000 Blackwell/);
  assert.match(source, /H200/);
  assert.match(source, /H100/);
  assert.match(source, /A100/);
  assert.match(source, /B200/);
  assert.match(source, /mode: "READ_ONLY"/);
  assert.match(source, /video_job_submitted: false/);
  assert.match(source, /runpod_endpoint_mutation_performed: false/);
  assert.match(source, /paid_external_provider_contacted: false/);
});
