import fs from 'node:fs';
import { register } from 'node:module';
register('./scripts/next-alias-loader.mjs', new URL('file://' + process.cwd() + '/'));
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://audit.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'audit-service-role-key';
const [{listOperatorCapabilities},{rankOperatorCapabilities}] = await Promise.all([
  import('@/lib/operator/runtime/OperatorCapabilityCatalog'),
  import('@/lib/operator/runtime/OperatorCapabilityMatcher'),
]);
const suite=JSON.parse(fs.readFileSync('benchmarks/business-partner/contrastive-suite.v1.json','utf8'));
const catalog=await listOperatorCapabilities();
const failures=[]; const details=[];
for(const c of suite.cases){
  const modes=c.kind==='write'?['draft','write','approve']:['read'];
  const candidates=catalog.filter(x=>modes.includes(String(x.mode||'').toLowerCase())&&x.operator_enabled!==false);
  const ranked=rankOperatorCapabilities({message:c.prompt,capabilities:candidates,modes,limit:12}).map(x=>({key:x.capability.key,score:x.score}));
  const expectedIndex=ranked.findIndex(x=>x.key===c.expected);
  const contrastIndex=ranked.findIndex(x=>x.key===c.contrast);
  const pass=expectedIndex>=0&&expectedIndex<=2&&(contrastIndex<0||expectedIndex<contrastIndex);
  const row={id:c.id,pass,prompt:c.prompt,expected:c.expected,contrast:c.contrast,expected_rank:expectedIndex,contrast_rank:contrastIndex,ranked:ranked.slice(0,8)};
  details.push(row); if(!pass) failures.push(row);
}
const out={contract:'AVANTIQO_BUSINESS_PARTNER_CONTRASTIVE_CERT_V1',certified:failures.length===0,cases:details.length,passed:details.filter(x=>x.pass).length,failed:failures.length,failures};
fs.writeFileSync('/tmp/business-partner-contrastive-result.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2)); if(failures.length) process.exitCode=1;
