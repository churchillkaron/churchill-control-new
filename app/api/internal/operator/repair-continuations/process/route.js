export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
import { runBusinessPartnerRepairContinuationBatch } from "@/lib/operator/runtime/BusinessPartnerRepairContinuationWorkerRuntime";
function authorized(request){ const secret=String(process.env.CRON_SECRET||"").trim(); return Boolean(secret)&&(request.headers.get("authorization")||"")===`Bearer ${secret}`; }
export async function GET(request){ if(!authorized(request)) return Response.json({success:false,error:"Unauthorized"},{status:401}); try{ const url=new URL(request.url); const limit=Math.max(1,Math.min(Number(url.searchParams.get("limit"))||4,12)); const result=await runBusinessPartnerRepairContinuationBatch({limit}); return Response.json(result,{status:result.failed_count>0?207:200}); }catch(error){ console.error("BUSINESS_PARTNER_REPAIR_CONTINUATION_WORKER_FAILED",error); return Response.json({success:false,error:error?.message||"Repair continuation worker failed"},{status:500}); } }
