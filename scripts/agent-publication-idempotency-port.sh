#!/usr/bin/env bash
set -euo pipefail

git fetch origin agent/creative-publication-idempotency

for path in \
  lib/creative/assets/graph/repositories/CreativeAssetGraphRepository.js \
  lib/creative/release/runtime/CreativePublishCommandRuntime.js \
  lib/creative/release/runtime/CreativePublishExecutionRuntime.js
do
  git show "origin/agent/creative-publication-idempotency:${path}" > "${path}"
done

python3 - <<'PY'
from pathlib import Path

execution_path = Path("lib/creative/release/runtime/CreativePublishExecutionRuntime.js")
source = execution_path.read_text()
source = source.replace(
    'import crypto from "node:crypto";\n\n',
    'import crypto from "node:crypto";\n\nimport {\n  signCreativeStorageReference,\n} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";\n\n',
    1,
)
source = source.replace(
    'function providerPayload(target, render, idempotencyKey) {',
    'async function providerPayload(target, render, organizationId, idempotencyKey) {',
    1,
)
old_urls = '''  if (kind === "image") payload.image_url = render.url;
  if (kind === "video") payload.video_url = render.url;
  if (kind === "audio") payload.audio_url = render.url;
'''
new_urls = '''  const deliveryUrl = await signCreativeStorageReference({
    organization_id: organizationId,
    reference: render.url,
  });
  if (kind === "image") payload.image_url = deliveryUrl;
  if (kind === "video") payload.video_url = deliveryUrl;
  if (kind === "audio") payload.audio_url = deliveryUrl;
'''
if source.count(old_urls) != 1:
    raise SystemExit(f"EXPECTED_ONE_PROVIDER_URL_BLOCK:{source.count(old_urls)}")
source = source.replace(old_urls, new_urls, 1)
old_call = '        input: providerPayload(target, render, identity),\n'
new_call = '        input: await providerPayload(target, render, organization_id, identity),\n'
if source.count(old_call) != 1:
    raise SystemExit(f"EXPECTED_ONE_PROVIDER_PAYLOAD_CALL:{source.count(old_call)}")
source = source.replace(old_call, new_call, 1)
execution_path.write_text(source)

provider_path = Path("lib/platform/service-runtime/providers/ProviderExecutor.js")
provider = provider_path.read_text()
first = '''    ...input,
    ...(credential || {}),
'''
first_new = '''    ...input,
    payload: input,
    ...(credential || {}),
'''
if provider.count(first) != 1:
    raise SystemExit(f"EXPECTED_ONE_EXECUTE_INPUT_BLOCK:{provider.count(first)}")
provider = provider.replace(first, first_new, 1)
second = '''    ...input,
    ...(credential || {}),
    credential: credential || null,
    context,
    credential_id: context?.credential_id || null,
  });
'''
second_new = '''    ...input,
    payload: input,
    ...(credential || {}),
    credential: credential || null,
    context,
    credential_id: context?.credential_id || null,
  });
'''
if provider.count(second) != 1:
    raise SystemExit(f"EXPECTED_ONE_STATUS_INPUT_BLOCK:{provider.count(second)}")
provider_path.write_text(provider.replace(second, second_new, 1))
PY

rm -f scripts/agent-publication-idempotency-port.sh
rm -f .github/workflows/agent-publication-idempotency-port.yml

# Trigger workflow after installation.
