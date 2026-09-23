import crypto from "node:crypto";
export const CODE_AI_HIDDEN_BENCHMARK_CONTRACT="AVANTIQO_CODE_AI_HIDDEN_BENCHMARK_V1";
function text(v,n=4000){return String(v??"").trim().slice(0,n)}
function list(v){return Array.isArray(v)?v:[]}
function bucket(id,salt){const h=crypto.createHmac("sha256",salt).update(id).digest();return h.readUInt32BE(0)%100}
export function partitionCodeAIHiddenBenchmarkCases({cases=[],salt,holdout_percent=25}={}){
 const secret=text(salt,1000); if(secret.length<16) throw new Error("CODE_AI_HIDDEN_BENCHMARK_SECRET_REQUIRED"); const pct=Math.max(10,Math.min(50,Number(holdout_percent)||25));
 const normalized=list(cases).map((c,i)=>({id:text(c?.id||`case-${i+1}`,240),family:text(c?.family,120)||"general",payload:c?.payload??null,expected:c?.expected??null}));
 if(normalized.length<8) throw new Error("CODE_AI_HIDDEN_BENCHMARK_CASE_COUNT_INSUFFICIENT");
 const held=[],visible=[]; for(const c of normalized){(bucket(c.id,secret)<pct?held:visible).push(c)}
 if(!held.length||!visible.length) throw new Error("CODE_AI_HIDDEN_BENCHMARK_PARTITION_DEGENERATE");
 return {contract:CODE_AI_HIDDEN_BENCHMARK_CONTRACT,visible_cases:visible.map(({expected,...x})=>x),held_out_cases:held,held_out_case_ids:held.map(c=>c.id),holdout_percent:pct,expected_values_exposed_to_candidate:false,partition_hash:crypto.createHash("sha256").update(held.map(c=>c.id).sort().join("|")).digest("hex")};
}
export function certifyCodeAIHiddenBenchmark({partition,results=[]}={}){
 const held=list(partition?.held_out_cases); if(!held.length) throw new Error("CODE_AI_HIDDEN_BENCHMARK_PARTITION_REQUIRED"); const map=new Map(list(results).map(r=>[text(r?.id,240),r]));
 const scored=held.map(c=>{const r=map.get(c.id);const passed=r?.passed===true;return {id:c.id,family:c.family,passed}}); const pass=scored.filter(x=>x.passed).length; const rate=pass/scored.length;
 return {contract:CODE_AI_HIDDEN_BENCHMARK_CONTRACT,held_out:true,case_count:scored.length,passed:pass,pass_rate:rate,verified:rate>=0.9,case_results:scored,expected_values_exposed_to_candidate:false};
}
export default Object.freeze({contract:CODE_AI_HIDDEN_BENCHMARK_CONTRACT,partition:partitionCodeAIHiddenBenchmarkCases,certify:certifyCodeAIHiddenBenchmark});
