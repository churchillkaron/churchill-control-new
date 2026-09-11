const text=(value,limit=600)=>String(value??'').trim().slice(0,limit);
const object=(value)=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const SAFE_KEY=/^[a-z][a-z0-9_]{0,79}$/i;
export function normalizedActionIdentityEvidence(values=[]){
  const output=[]; const seen=new Set();
  for(const raw of Array.isArray(values)?values:[]){
    const value=text(raw); const split=value.indexOf(':');
    if(split<1) continue;
    const key=value.slice(0,split).trim().toLowerCase(); const id=value.slice(split+1).trim();
    if(!SAFE_KEY.test(key)||!id||id.length>500) continue;
    const item=`${key}:${id}`; if(!seen.has(item)){seen.add(item);output.push(item);} if(output.length>=50) break;
  }
  return output;
}
export function attachActionIdentityEvidence(error,values=[]){
  const target=error instanceof Error?error:new Error(text(error)||'WRITE_FAILED');
  const merged=normalizedActionIdentityEvidence([...(target.action_identity_evidence||[]),...values]);
  target.action_identity_evidence=merged;
  target.mutation_completion_proven=false;
  return target;
}
export function verifierPayloadFromActionIdentityEvidence(declaration={},evidence=[]){
  const binding=object(declaration.payload_from_result); const normalized=normalizedActionIdentityEvidence(evidence);
  const byKey=new Map(normalized.map((item)=>{const i=item.indexOf(':');return [item.slice(0,i),item.slice(i+1)];}));
  const entries=Object.entries(binding); if(!entries.length||entries.length>8) return null;
  const payload={};
  for(const [payloadKey] of entries){const key=text(payloadKey,80).toLowerCase(); const value=byKey.get(key); if(!SAFE_KEY.test(key)||!value) return null; payload[payloadKey]=value;}
  return payload;
}
