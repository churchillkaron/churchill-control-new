from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path, old, new, count=1):
    target = ROOT / path
    text = target.read_text()
    actual = text.count(old)
    if actual < count:
        raise SystemExit(f"PATCH_PATTERN_MISSING:{path}:{old[:80]!r}:{actual}")
    target.write_text(text.replace(old, new, count))


storage_runtime = '''import { getServiceSupabase } from "@/lib/shared/supabase/service";

const STORAGE_PREFIX = "storage://";

function text(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function creativeStorageReference(value) {
  const source = text(value);
  if (!source.startsWith(STORAGE_PREFIX)) return null;
  const remainder = source.slice(STORAGE_PREFIX.length);
  const separator = remainder.indexOf("/");
  if (separator <= 0 || separator === remainder.length - 1) {
    throw new Error("CREATIVE_STORAGE_REFERENCE_INVALID");
  }
  return {
    bucket: remainder.slice(0, separator),
    path: remainder.slice(separator + 1),
  };
}

export function creativeStorageUri(bucket, storagePath) {
  if (!text(bucket) || !text(storagePath)) {
    throw new Error("CREATIVE_STORAGE_LOCATION_REQUIRED");
  }
  return `${STORAGE_PREFIX}${text(bucket)}/${text(storagePath)}`;
}

function assertOrganizationPath(organizationId, storagePath) {
  if (!organizationId) throw new Error("organization_id required");
  if (!text(storagePath).startsWith(`${organizationId}/`)) {
    throw new Error("CREATIVE_STORAGE_REFERENCE_ORGANIZATION_MISMATCH");
  }
}

export async function downloadCreativeStorageReference({
  organization_id,
  reference,
} = {}) {
  const parsed = creativeStorageReference(reference);
  if (!parsed) throw new Error("CREATIVE_STORAGE_REFERENCE_REQUIRED");
  assertOrganizationPath(organization_id, parsed.path);
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .download(parsed.path);
  if (error) throw error;
  if (!data) throw new Error("CREATIVE_STORAGE_DOWNLOAD_REQUIRED");
  return {
    bucket: parsed.bucket,
    storage_path: parsed.path,
    blob: data,
  };
}

export async function signCreativeStorageReference({
  organization_id,
  reference,
  expires_in = null,
} = {}) {
  const parsed = creativeStorageReference(reference);
  if (!parsed) return reference;
  assertOrganizationPath(organization_id, parsed.path);
  const expiresIn = positiveInteger(
    expires_in ?? process.env.CREATIVE_PRIVATE_MEDIA_URL_TTL_SECONDS,
  );
  if (!expiresIn) {
    throw new Error("CREATIVE_PRIVATE_MEDIA_URL_TTL_SECONDS_REQUIRED");
  }
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, expiresIn);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CREATIVE_PRIVATE_MEDIA_SIGNED_URL_REQUIRED");
  return data.signedUrl;
}
'''
(ROOT / "lib/creative/assets/storage/CreativePrivateStorageRuntime.js").write_text(storage_runtime)

# Media inspection: materialize canonical private storage directly, never via public URLs.
path = "lib/creative/media/runtime/CreativeMediaInspectionRuntime.js"
replace(path,
'''import sharp from "sharp";
''',
'''import sharp from "sharp";

import {
  creativeStorageReference,
  downloadCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
''')
replace(path,
'''export async function materializeMedia({
  file = null,
  url = null,
  file_name = null,
  mime_type = null,
  policy = {},
} = {}) {
''',
'''export async function materializeMedia({
  file = null,
  url = null,
  file_name = null,
  mime_type = null,
  organization_id = null,
  policy = {},
} = {}) {
''')
replace(path,
'''    } else {
      details = await fetchRemoteToFile({ url, filePath, policy });
      details.mime_type = details.mime_type || normalizeMime(mime_type);
    }
''',
'''    } else if (creativeStorageReference(url)) {
      const stored = await downloadCreativeStorageReference({
        organization_id,
        reference: url,
      });
      const buffer = Buffer.from(await stored.blob.arrayBuffer());
      const maximumBytes = configuredNumber(
        policy,
        "max_bytes",
        "maxBytes",
        "CREATIVE_MEDIA_MAX_INSPECTION_BYTES",
      );
      if (maximumBytes && buffer.length > maximumBytes) {
        throw new Error("MEDIA_EXCEEDS_INSPECTION_LIMIT");
      }
      await fs.writeFile(filePath, buffer);
      details = {
        final_url: url,
        file_size_bytes: buffer.length,
        checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
        mime_type: normalizeMime(stored.blob.type || mime_type),
      };
    } else {
      details = await fetchRemoteToFile({ url, filePath, policy });
      details.mime_type = details.mime_type || normalizeMime(mime_type);
    }
''')

# Final render: private canonical URI, organisation-scoped source materialisation.
path = "lib/creative/post-production/runtime/CreativeEdlRenderRuntime.js"
replace(path,
'''import { getServiceSupabase } from "@/lib/shared/supabase/service";
''',
'''import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
''')
replace(path,
'''async function materializeNode(node, policy) {
''',
'''async function materializeNode(node, organizationId, policy) {
''')
replace(path,
'''    mime_type: node.technical?.mime_type || null,
    policy,
''',
'''    mime_type: node.technical?.mime_type || null,
    organization_id: organizationId,
    policy,
''')
replace(path,
'''  const { data } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(storagePath);

  return {
    bucket,
    storage_path: storagePath,
    url: data.publicUrl,
''',
'''  return {
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
''')
replace(path,
'''          url: edit.source_url,
          policy,
''',
'''          url: edit.source_url,
          organization_id,
          policy,
''')
replace(path, "materializeNode(node, policy)", "materializeNode(node, organization_id, policy)", 3)
replace(path,
'''        mime_type: uploaded.mime_type,
        policy,
''',
'''        mime_type: uploaded.mime_type,
        organization_id,
        policy,
''')

# Temporal analysis and perceptual QC can materialize private canonical references.
for path in [
    "lib/creative/media/runtime/CreativeTemporalAnalysisRuntime.js",
    "lib/creative/quality/runtime/CreativePerceptualQualityRuntime.js",
]:
    replace(path,
'''      mime_type: parent.technical?.mime_type || null,
      policy,
''',
'''      mime_type: parent.technical?.mime_type || null,
      organization_id,
      policy,
''') if "Temporal" in path else replace(path,
'''      mime_type: render.technical?.mime_type || null,
      policy,
''',
'''      mime_type: render.technical?.mime_type || null,
      organization_id,
      policy,
''')

# Derivatives: require configured private bucket and persist storage URI.
path = "lib/creative/media/runtime/CreativeMediaDerivativeRuntime.js"
replace(path,
'''import { getServiceSupabase } from "@/lib/shared/supabase/service";
''',
'''import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
''')
replace(path,
'''    process.env.CREATIVE_MEDIA_DERIVATIVE_BUCKET ||
    "marketing-assets";
''',
'''    process.env.CREATIVE_MEDIA_DERIVATIVE_BUCKET ||
    null;
  if (!bucket) throw new Error("DERIVATIVE_STORAGE_BUCKET_REQUIRED");
''')
replace(path,
'''  const { data } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(storagePath);

  return {
    bucket,
    storage_path: storagePath,
    public_url: data.publicUrl,
''',
'''  return {
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
''')
replace(path,
'''      mime_type: parent.technical?.mime_type || null,
      policy,
''',
'''      mime_type: parent.technical?.mime_type || null,
      organization_id,
      policy,
''')
replace(path, "url: uploaded.public_url,", "url: uploaded.url,", 2)
replace(path,
'''          mime_type: uploaded.mime_type,
          policy,
''',
'''          mime_type: uploaded.mime_type,
          organization_id,
          policy,
''')

# Publish: transient signed URL only at connector execution.
path = "lib/creative/release/runtime/CreativePublishExecutionRuntime.js"
replace(path,
'''import crypto from "node:crypto";
''',
'''import crypto from "node:crypto";

import {
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
''')
replace(path,
'''function providerPayload(target, render) {
''',
'''async function providerPayload(target, render, organizationId) {
''')
replace(path,
'''  if (kind === "image") payload.image_url = render.url;
  if (kind === "video") payload.video_url = render.url;
  if (kind === "audio") payload.audio_url = render.url;
''',
'''  const deliveryUrl = await signCreativeStorageReference({
    organization_id: organizationId,
    reference: render.url,
  });
  if (kind === "image") payload.image_url = deliveryUrl;
  if (kind === "video") payload.video_url = deliveryUrl;
  if (kind === "audio") payload.audio_url = deliveryUrl;
''')
replace(path,
'''        input: providerPayload(target, render),
''',
'''        input: await providerPayload(target, render, organization_id),
''')

# Release preflight: verify derivative privacy and transient private-media TTL.
path = "app/api/creative/release/preflight/route.js"
replace(path,
'''    const renderBucket = process.env.CREATIVE_MEDIA_RENDER_BUCKET;
''',
'''    const renderBucket = process.env.CREATIVE_MEDIA_RENDER_BUCKET;
    const derivativeBucket = process.env.CREATIVE_MEDIA_DERIVATIVE_BUCKET;
''')
replace(path,
'''      renderBucketResult,
      executionEvidence,
''',
'''      renderBucketResult,
      derivativeBucketResult,
      executionEvidence,
''')
replace(path,
'''      queryBucket(renderBucket),
      Promise.all(executionRequirements.map((item) =>
''',
'''      queryBucket(renderBucket),
      queryBucket(derivativeBucket),
      Promise.all(executionRequirements.map((item) =>
''')
replace(path,
'''      check("render_bucket_private", true, renderBucketResult.private, { bucket: renderBucket || null }),
''',
'''      check("render_bucket_private", true, renderBucketResult.private, { bucket: renderBucket || null }),
      check("derivative_bucket_configured", true, configured(derivativeBucket), derivativeBucket || null),
      check("derivative_bucket_exists", true, derivativeBucketResult.found, derivativeBucketResult.error),
      check("derivative_bucket_private", true, derivativeBucketResult.private, { bucket: derivativeBucket || null }),
      check("private_media_url_ttl_configured", true, number(process.env.CREATIVE_PRIVATE_MEDIA_URL_TTL_SECONDS, null) > 0, process.env.CREATIVE_PRIVATE_MEDIA_URL_TTL_SECONDS || null),
''')

print("CREATIVE_PRIVATE_STORAGE_BOUNDARY_APPLIED")
