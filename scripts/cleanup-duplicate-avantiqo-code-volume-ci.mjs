const CONTRACT = 'AVANTIQO_CODE_DUPLICATE_VOLUME_CLEANUP_V1';
const REST = 'https://rest.runpod.io/v1';
const DUPLICATE_ID = 'ov58rf8zng';
const DUPLICATE_NAME = 'avantiqo-code-cache-ap-jp-1';
const CANONICAL_ID = 'qcg1rbzc3g';
const CANONICAL_NAME = 'avantiqo-code-cache-eur-is-1';
const CODE_ENDPOINT = 'avantiqo-code-v1';
const text = v => String(v ?? '').trim();
const list = v => Array.isArray(v) ? v : [];
const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!key) throw new Error(`${CONTRACT}_RUNPOD_KEY_REQUIRED`);

async function request(path, options = {}) {
  const r = await fetch(`${REST}${path}`, {
    method: options.method || 'GET',
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  const raw = await r.text();
  let body = null; try { body = raw ? JSON.parse(raw) : {}; } catch {}
  if (!r.ok) {
    if (options.allow404 && r.status === 404) return { __not_found: true };
    throw new Error(`${CONTRACT}_HTTP_${r.status}:${text(body?.message || body?.error || raw).slice(0,300)}`);
  }
  return body ?? {};
}
const rows = (raw, keys=[]) => Array.isArray(raw) ? raw : list(keys.map(k=>raw?.[k]).find(Array.isArray) || raw?.data || raw?.items || raw?.results);
const endpointVolumeIds = e => [...new Set([text(e?.networkVolumeId), ...list(e?.networkVolumeIds).map(v=>text(typeof v === 'string' ? v : v?.id || v?.networkVolumeId))].filter(Boolean))];
const podVolumeId = p => text(p?.networkVolumeId || p?.networkVolume?.id);

console.log(`${CONTRACT}_PRODUCTION_DEPLOY_PERFORMED=false`);
console.log(`${CONTRACT}_GPU_ACTIVATION_PERFORMED=false`);
console.log(`${CONTRACT}_MODEL_INFERENCE_PERFORMED=false`);
console.log(`${CONTRACT}_NEW_VOLUME_CREATED=false`);

const [volRaw, epRaw, podRaw] = await Promise.all([
  request('/networkvolumes'),
  request('/endpoints?includeTemplate=false&includeWorkers=true'),
  request('/pods'),
]);
const volumes = rows(volRaw, ['networkVolumes']);
const endpoints = rows(epRaw, ['endpoints']);
const pods = rows(podRaw, ['pods']);
const dup = volumes.filter(v=>text(v?.id)===DUPLICATE_ID && text(v?.name)===DUPLICATE_NAME);
const canonical = volumes.filter(v=>text(v?.id)===CANONICAL_ID && text(v?.name)===CANONICAL_NAME);
if (dup.length !== 1) throw new Error(`${CONTRACT}_DUPLICATE_VOLUME_RESOLUTION:${dup.length}`);
if (canonical.length !== 1) throw new Error(`${CONTRACT}_CANONICAL_VOLUME_RESOLUTION:${canonical.length}`);
const code = endpoints.filter(e=>text(e?.name)===CODE_ENDPOINT);
if (code.length !== 1) throw new Error(`${CONTRACT}_CODE_ENDPOINT_RESOLUTION:${code.length}`);
if (!endpointVolumeIds(code[0]).includes(CANONICAL_ID)) throw new Error(`${CONTRACT}_CODE_NOT_ON_CANONICAL_VOLUME`);
if (endpointVolumeIds(code[0]).includes(DUPLICATE_ID)) throw new Error(`${CONTRACT}_DUPLICATE_STILL_BOUND_TO_CODE`);
const endpointConsumers = endpoints.filter(e=>endpointVolumeIds(e).includes(DUPLICATE_ID)).map(e=>({id:text(e.id),name:text(e.name)}));
const podConsumers = pods.filter(p=>podVolumeId(p)===DUPLICATE_ID).map(p=>({id:text(p.id),name:text(p.name),desired_status:text(p.desiredStatus)}));
if (endpointConsumers.length) throw new Error(`${CONTRACT}_ENDPOINT_CONSUMERS:${JSON.stringify(endpointConsumers)}`);
if (podConsumers.length) throw new Error(`${CONTRACT}_POD_CONSUMERS:${JSON.stringify(podConsumers)}`);

await request(`/networkvolumes/${encodeURIComponent(DUPLICATE_ID)}`, { method: 'DELETE' });
const afterRaw = await request('/networkvolumes');
const after = rows(afterRaw, ['networkVolumes']);
if (after.some(v=>text(v?.id)===DUPLICATE_ID)) throw new Error(`${CONTRACT}_DELETE_NOT_VERIFIED`);
if (!after.some(v=>text(v?.id)===CANONICAL_ID && text(v?.name)===CANONICAL_NAME)) throw new Error(`${CONTRACT}_CANONICAL_VOLUME_LOST`);
console.log(JSON.stringify({success:true,contract:CONTRACT,deleted_volume:{id:DUPLICATE_ID,name:DUPLICATE_NAME},canonical_code_volume:{id:CANONICAL_ID,name:CANONICAL_NAME},endpoint_consumers_before:endpointConsumers,pod_consumers_before:podConsumers,network_volume_count_after:after.length,production_deploy_performed:false,gpu_activation_performed:false,model_inference_performed:false,new_volume_created:false,secrets_printed:false},null,2));
console.log(`${CONTRACT}=PASS`);
