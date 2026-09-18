import { localDateString, validTimezone } from "../../shared/time/organizationDate.js";
export const AVANTIQO_BUSINESS_PARTNER_BUSINESS_DIAGNOSIS_CONTRACT = "AVANTIQO_BUSINESS_PARTNER_BUSINESS_DIAGNOSIS_V1";

const text=(v,n=12000)=>String(v??"").trim().slice(0,n);
const list=(v)=>Array.isArray(v)?v:[];
const object=(v)=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
const classifierText=(v)=>text(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const BUSINESS_METRIC_PATTERN=/(?:\b(?:profit|margin|revenue|sales|cost|expense|cogs|food cost|labor cost|occupancy|bookings?|cash|cash flow|demand|staffing|attendance|turnover|inventory|stock|churn|retention|customer acquisition|service quality|complaints?|project delay|delivery|vinst(?:en)?|marginal(?:en)?|intakt(?:er|erna)?|omsattning(?:en)?|forsaljning(?:en)?|kostnad(?:en|er|erna)?|utgift(?:en|er|erna)?|belaggning(?:en)?|bokningar?|kassa|kassaflöde|efterfrågan|bemanning|narvaro|lager|kundbortfall|gewinn(?:e|s)?|marge(?:n)?|umsatz(?:es)?|verkauf|kosten|ausgaben|auslastung|buchungen?|kasse|cashflow|nachfrage|personal|anwesenheit|bestand|kundenabwanderung|benefice(?:s)?|marge(?:s)?|revenu(?:s)?|chiffre d'affaires|ventes|cout(?:s)?|depense(?:s)?|occupation|reservations?|tresorerie|flux de tresorerie|demande|personnel|presence|stock|attrition|beneficio(?:s)?|margen(?:es)?|ingresos|ventas|coste(?:s)?|costo(?:s)?|gasto(?:s)?|ocupacion|reservas?|efectivo|flujo de caja|demanda|personal|asistencia|inventario|existencias|abandono)\b|กำไร|อัตรากำไร|รายได้|ยอดขาย|ต้นทุน|ค่าใช้จ่าย|อัตราเข้าพัก|การจอง|เงินสด|กระแสเงินสด|อุปสงค์|พนักงาน|การเข้างาน|สินค้าคงคลัง|สต็อก|การเลิกใช้บริการ)/i;
const CAUSAL_PATTERN=/(?:\b(?:why|reason|cause|driver|explain|diagnose|root cause|varfor|orsak|forklara|diagnostisera|grundorsak|warum|grund|ursache|erklaren|diagnostizieren|ursachenanalyse|pourquoi|raison|cause|expliquer|diagnostiquer|cause racine|por que|porque|razon|causa|explicar|diagnosticar|causa raiz)\b|ทำไม|เหตุผล|สาเหตุ|อธิบาย|วิเคราะห์สาเหตุ)/i;
const CHANGE_PATTERN=/(?:\b(?:drop|dropped|dropping|down|declin(?:e|ed|ing)?|decrease|decreased|decreasing|increase|increased|increasing|up|worse|lower|higher|change|changed|slow|late|delay|shortage|stockout|churn|fall|fell|rise|rose|improve|improved|worsen|worsened|sjunkit|minskat|minskar|okat|okar|lagre|hogre|forandrats|samre|battre|fallit|stigit|gesunken|gesenkt|niedrig(?:e|er|ere|eren|eres)?|hoh(?:e|er|ere|eren|eres)?|gestiegen|verändert|schlechter|besser|gefallen|baisse|baisse|diminue|plus bas|augmente|plus eleve|change|pire|meilleur|cayó|bajó|disminuyó|mas bajos?|subio|aumento|mas altos?|cambio|peor|mejor)\b|ลดลง|ตกลง|ต่ำลง|เพิ่มขึ้น|สูงขึ้น|เปลี่ยนแปลง|แย่ลง|ดีขึ้น|ช้าลง|ล่าช้า)/i;
const COMPARISON_PATTERN=/(?:\b(?:is|are|was|were|did|has|have)\b.{0,80}\b(?:down|up|lower|higher|better|worse|changed|change|increased|decreased|fell|rose)\b|\b(?:compare|comparison|versus|vs\.?|compared with|compared to|from last|since last|month over month|year over year|mom|yoy|jamfor|jamfort med|sedan forra|manad mot manad|ar mot ar|vergleich|verglichen mit|seit letztem|monat zu monat|jahr zu jahr|comparer|compare a|par rapport (?:a|au|aux)|depuis le mois dernier|mois sur mois|annee sur annee|comparar|comparado con|frente a|desde el mes pasado|mes a mes|ano a ano)\b|เทียบกับ|เปรียบเทียบ|เดือนต่อเดือน|ปีต่อปี)/i;
const RECOMMENDATION_PATTERN=/(?:\b(?:what should (?:we|i) do|what do you (?:recommend|suggest)|what would you do|how should (?:we|i) respond|what next|next step|how do (?:we|i) fix|how can (?:we|i) improve|what can (?:we|i) do|vad ska (?:vi|jag).{0,80}\bgora|vad rekommenderar du|vad foreslar du|hur ska (?:vi|jag) agera|vad ar nasta steg|was sollen (?:wir|ich).{0,80}\btun|was empfiehlst du|was schlägst du vor|wie sollen (?:wir|ich) reagieren|was ist der nächste schritt|que devons-nous.{0,80}\bfaire|qu'est-ce que tu recommandes|que recommandes-tu|que suggeres-tu|comment devons-nous réagir|prochaine étape|que debemos.{0,80}\bhacer|que recomiendas|que sugieres|como debemos responder|siguiente paso)\b|เราควรทำอย่างไร|คุณแนะนำอะไร|ควรแก้อย่างไร|ขั้นตอนต่อไป)/i;
const CURRENT_READ_PATTERN=/^\s*(?:show|list|give|tell|what(?:'s| is)|how much|how many|visa|lista|ge|beratta|vad ar|hur mycket|hur manga|zeige|liste|gib|sag|was ist|wie viel|wie viele|montre|liste|donne|dis|quel est|quelle est|combien|muestra|lista|dame|dime|cual es|cuanto|cuantos|แสดง|บอก|เท่าไร|เท่าไหร่).{0,120}(?:current|today|now|latest|nuvarande|idag|nu|senaste|aktuell|heute|jetzt|neueste|actuel|aujourd'hui|maintenant|dernier|actual|hoy|ahora|ultimo|ปัจจุบัน|วันนี้|ตอนนี้|ล่าสุด)?.{0,120}(?:\b(?:profit|margin|revenue|sales|cost|expense|cogs|food cost|labor cost|occupancy|bookings?|cash|cash flow|demand|staffing|attendance|turnover|inventory|stock|churn|retention|vinst(?:en)?|marginal(?:en)?|intakt(?:er|erna)?|omsattning(?:en)?|forsaljning(?:en)?|kostnad(?:en|er|erna)?|utgift(?:en|er|erna)?|belaggning(?:en)?|bokningar?|kassa|kassaflöde|efterfrågan|bemanning|narvaro|lager|gewinn(?:e|s)?|marge(?:n)?|umsatz(?:es)?|verkauf|kosten|ausgaben|auslastung|buchungen?|kasse|cashflow|nachfrage|personal|anwesenheit|bestand|benefice|marge|revenu|ventes|cout|depense|occupation|reservations?|tresorerie|demande|personnel|presence|stock|beneficio(?:s)?|margen(?:es)?|ingresos|ventas|coste(?:s)?|costo(?:s)?|gasto(?:s)?|ocupacion|reservas?|efectivo|demanda|personal|asistencia|inventario|existencias)\b|กำไร|อัตรากำไร|รายได้|ยอดขาย|ต้นทุน|ค่าใช้จ่าย|อัตราเข้าพัก|การจอง|เงินสด|กระแสเงินสด|อุปสงค์|พนักงาน|การเข้างาน|สินค้าคงคลัง|สต็อก)/i;

export function classifyBusinessDiagnosisQuestion(message){
  const value=classifierText(message);
  if(!value||!BUSINESS_METRIC_PATTERN.test(value)) return {match:false,class:null};
  const causal=CAUSAL_PATTERN.test(value);
  const changed=CHANGE_PATTERN.test(value);
  const comparative=COMPARISON_PATTERN.test(value);
  const recommendation=RECOMMENDATION_PATTERN.test(value);
  if(causal) return {match:true,class:"CAUSAL_DIAGNOSIS"};
  if(comparative) return {match:true,class:"PERIOD_COMPARISON"};
  if(recommendation&&changed) return {match:true,class:"EVIDENCE_FIRST_RECOMMENDATION"};
  if(changed&&!CURRENT_READ_PATTERN.test(value)) return {match:true,class:"CHANGE_DIAGNOSIS"};
  return {match:false,class:null};
}

export function isBusinessDiagnosisQuestion(message){return classifyBusinessDiagnosisQuestion(message).match===true;}

async function periodRows({organizationId,entityId=null}={}){
  const { supabaseAdmin } = await import("../../shared/supabase/admin.js");
  let q=supabaseAdmin.from("accounting_periods").select("id,organization_id,entity_id,start_date,end_date,status").eq("organization_id",organizationId).order("start_date",{ascending:false}).limit(36);
  if(entityId) q=q.or(`entity_id.eq.${entityId},entity_id.is.null`);
  const {data,error}=await q;if(error) throw error;return list(data);
}

function normalizedPeriodRows(rows,{organizationId,entityId=null}={}){
  const organization=text(organizationId,160);
  const entity=text(entityId,160)||null;
  return list(rows).filter((row)=>{
    if(text(row?.organization_id,160)&&text(row.organization_id,160)!==organization) return false;
    const rowEntity=text(row?.entity_id,160)||null;
    return !entity||rowEntity===entity||rowEntity===null;
  }).sort((a,b)=>{
    const dateOrder=text(b?.start_date,40).localeCompare(text(a?.start_date,40));
    if(dateOrder!==0) return dateOrder;
    if(entity){
      const aExact=(text(a?.entity_id,160)||null)===entity;
      const bExact=(text(b?.entity_id,160)||null)===entity;
      if(aExact!==bExact) return aExact?-1:1;
    }
    return text(a?.id,160).localeCompare(text(b?.id,160));
  });
}

function scopedPeriodCandidate(rows,{entityId=null,beforeStartDate=null,notAfterDate=null}={}){
  const entity=text(entityId,160)||null;
  const eligible=list(rows).filter((row)=>{
    const start=text(row?.start_date,40);
    if(!start) return false;
    if(beforeStartDate&&start>=beforeStartDate) return false;
    if(notAfterDate&&start>notAfterDate) return false;
    return true;
  });
  if(!eligible.length) return null;
  const nearestStart=text(eligible[0]?.start_date,40);
  const nearest=eligible.filter((row)=>text(row?.start_date,40)===nearestStart);
  if(entity){
    const exact=nearest.find((row)=>(text(row?.entity_id,160)||null)===entity);
    if(exact) return exact;
  }
  return nearest.find((row)=>(text(row?.entity_id,160)||null)===null)||nearest[0]||null;
}

export async function resolveBusinessDiagnosisPeriods({organizationId,entityId=null,baselinePeriodId=null,currentPeriodId=null,timezone="UTC",now=new Date(),loadPeriods=periodRows}={}){
  const rows=normalizedPeriodRows(await loadPeriods({organizationId,entityId}),{organizationId,entityId});
  if(!rows.length) return {status:"PERIODS_UNAVAILABLE",baseline_period_id:null,current_period_id:null};
  const selectedId=text(currentPeriodId,160)||null;
  let current=selectedId?rows.find((row)=>text(row?.id,160)===selectedId):null;
  if(selectedId&&!current) return {status:"CURRENT_PERIOD_NOT_FOUND",baseline_period_id:null,current_period_id:null};
  if(!current){
    const instant=now instanceof Date&&!Number.isNaN(now.getTime())?now:new Date();
    const resolvedTimezone=validTimezone(timezone)||"UTC";
    const today=localDateString(instant,resolvedTimezone);
    current=scopedPeriodCandidate(rows,{entityId,notAfterDate:today});
  }
  if(!current) return {status:"CURRENT_PERIOD_NOT_FOUND",baseline_period_id:null,current_period_id:null};
  const selectedBaselineId=text(baselinePeriodId,160)||null;
  let baseline=selectedBaselineId?rows.find((row)=>text(row?.id,160)===selectedBaselineId):null;
  if(selectedBaselineId&&!baseline) return {status:"BASELINE_PERIOD_NOT_FOUND",baseline_period_id:null,current_period_id:text(current.id,160)};
  if(baseline&&text(baseline.start_date,40)>=text(current.start_date,40)) return {status:"BASELINE_PERIOD_INVALID_ORDER",baseline_period_id:text(baseline.id,160),current_period_id:text(current.id,160)};
  if(!baseline) baseline=scopedPeriodCandidate(rows,{entityId,beforeStartDate:text(current.start_date,40)});
  if(!baseline) return {status:"BASELINE_PERIOD_NOT_FOUND",baseline_period_id:null,current_period_id:text(current.id,160)};
  return {status:"PERIOD_PAIR_READY",baseline_period_id:text(baseline.id,160),current_period_id:text(current.id,160),baseline_start_date:baseline.start_date||null,baseline_end_date:baseline.end_date||null,current_start_date:current.start_date||null,current_end_date:current.end_date||null,current_status:text(current.status,80)||null,baseline_status:text(baseline.status,80)||null};
}

export async function runBusinessPartnerBusinessDiagnosis(options={},dependencies={}){
  if(text(options.source,40).toLowerCase()==="event") return null;
  if(object(options.agreementState)?.pending_execution) return null;
  if(!isBusinessDiagnosisQuestion(options.message)) return null;
  const organizationId=text(options.organizationId,160);
  if(!organizationId) return null;
  const periods=await resolveBusinessDiagnosisPeriods({organizationId,entityId:text(options.entityId,160)||null,currentPeriodId:text(options.periodId,160)||null,timezone:text(options.timezone,160)||"UTC",loadPeriods:dependencies.loadPeriods||periodRows,now:dependencies.now||new Date()});
  if(periods.status!=="PERIOD_PAIR_READY") return null;
  const runDiagnosis=dependencies.runDiagnosis||(async(payload)=>{const { BusinessIntelligenceAgentRuntime } = await import("../../intelligence/runtime/BusinessIntelligenceAgentRuntime.js");return BusinessIntelligenceAgentRuntime.run(payload);});
  const diagnosisClass=classifyBusinessDiagnosisQuestion(options.message).class;
  const result=await runDiagnosis({
    organization_id:organizationId,party_id:text(options.partyId,160)||null,entity_id:text(options.entityId,160)||null,question:text(options.message),messages:list(options.conversation),
    context:{baseline_period_id:periods.baseline_period_id,current_period_id:periods.current_period_id,baseline_period_start_date:periods.baseline_start_date,baseline_period_end_date:periods.baseline_end_date,current_period_start_date:periods.current_start_date,current_period_end_date:periods.current_end_date,business_diagnosis_class:diagnosisClass},memories:list(options.longTermMemory),actor:object(options.actor),permissions:list(options.permissions),callerRequest:options.callerRequest||null,period_id:periods.current_period_id,mode:"deep",
  });
  const response=text(result?.result?.response)||"I could not produce a verified business diagnosis from the available evidence.";
  const receipt=object(result?.business_diagnosis_receipt);
  return {
    success:true,decision:{response_text:response,response_language:text(options.locale,80)||null,intent:"business_diagnosis",confidence:1,agreement_state:object(options.agreementState),project_state:object(options.projectState),clarification:{required:false,question:null,options:[]},navigation:{target_id:null},execution:{capability_key:null,payload:{},reason:null},plan:[]},
    agreement_state:object(options.agreementState),provider_evidence:null,navigation:null,execution:null,
    business_diagnosis:{contract:AVANTIQO_BUSINESS_PARTNER_BUSINESS_DIAGNOSIS_CONTRACT,class:receipt.diagnosis_class||diagnosisClass,periods,receipt_fingerprint:receipt.receipt_fingerprint||null,audit_projection_fingerprint:receipt.audit_projection_fingerprint||null,final_evidence_state:receipt.final_evidence_state||null,residual_material:receipt.residual_material===true,answer_boundary_status:receipt.answer_boundary_status||null,answer_unsupported_recommendation_outcome_detected:receipt.answer_unsupported_recommendation_outcome_detected===true,validated_external_context_count:list(receipt.validated_external_context_ids).length,unresolved_external_context_count:list(receipt.rejected_or_unresolved_external_contexts).length,authority_effect:"NONE"},
    intelligence_supervision:{contract:AVANTIQO_BUSINESS_PARTNER_BUSINESS_DIAGNOSIS_CONTRACT,owned_brief_used:false,live_evidence_used:true,business_diagnosis_routed:true,execution_governance_bypassed:false,raw_reasoning_persisted:false,authority_effect:"NONE"},
  };
}

export const BusinessPartnerBusinessDiagnosisRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_PARTNER_BUSINESS_DIAGNOSIS_CONTRACT,isQuestion:isBusinessDiagnosisQuestion,classifyQuestion:classifyBusinessDiagnosisQuestion,resolvePeriods:resolveBusinessDiagnosisPeriods,run:runBusinessPartnerBusinessDiagnosis});
