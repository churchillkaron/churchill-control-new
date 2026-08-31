const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_INTELLIGENCE_SERVERLESS_CAPACITY_NOW_V1";
const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const finite = (v,d=null) => Number.isFinite(Number(v)) ? Number(v) : d;
const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!key) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
const query = `query AvantiqoIntelligenceCapacityNow { gpuTypes { id displayName memoryInGb } dataCenters { id name location gpuAvailability { gpuTypeId displayName stockStatus } } }`;
const r = await fetch(GRAPHQL_URL,{method:"POST",headers:{Authorization:`Bearer ${key}`,Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify({query}),signal:AbortSignal.timeout(30000)});
const raw=await r.text();let body=null;try{body=raw?JSON.parse(raw):null}catch{}if(!r.ok||body===null)throw new Error(`${CONTRACT}_HTTP_${r.status}`);if(list(body.errors).length)throw new Error(`${CONTRACT}_GRAPHQL:${text(body.errors[0]?.message).slice(0,500)}`);
const gpuTypes=list(body?.data?.gpuTypes).map(g=>({id:text(g.id),display_name:text(g.displayName)||null,memory_gb:finite(g.memoryInGb)})).filter(g=>finite(g.memory_gb,0)>=80).sort((a,b)=>(b.memory_gb||0)-(a.memory_gb||0)||a.id.localeCompare(b.id));
const byId=new Map(gpuTypes.map(g=>[g.id,g]));const availability=[];for(const dc of list(body?.data?.dataCenters)){for(const a of list(dc?.gpuAvailability)){const id=text(a.gpuTypeId);if(!byId.has(id))continue;availability.push({gpu_type_id:id,display_name:text(a.displayName)||byId.get(id)?.display_name||null,memory_gb:byId.get(id)?.memory_gb||null,data_center_id:text(dc.id)||null,location:text(dc.location||dc.name)||null,stock_status:text(a.stockStatus)||null});}}
const rank={HIGH:3,MEDIUM:2,LOW:1,NONE:0,UNAVAILABLE:0};const summary=gpuTypes.map(g=>{const rows=availability.filter(a=>a.gpu_type_id===g.id);const best=rows.slice().sort((a,b)=>(rank[text(b.stock_status).toUpperCase()]||0)-(rank[text(a.stock_status).toUpperCase()]||0))[0]||null;return {...g,best_stock_status:best?.stock_status||null,best_location:best?.location||null,visible_locations:rows.length};}).sort((a,b)=>(rank[text(b.best_stock_status).toUpperCase()]||0)-(rank[text(a.best_stock_status).toUpperCase()]||0)||(b.memory_gb||0)-(a.memory_gb||0));
console.log(JSON.stringify({success:true,contract:CONTRACT,memory_floor_gb:80,gpu_summary:summary,availability,generation_submitted:false,gpu_activation_performed:false,mutation_performed:false,new_network_volume_created:false,production_deploy_performed:false},null,2));console.log(`${CONTRACT}=PASS`);
