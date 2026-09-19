export const AVANTIQO_CAPABILITY_CRITICALITY_CONTRACT = "AVANTIQO_CAPABILITY_CRITICALITY_V1";
const bounded=(v,f=0)=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):f};
const text=(v,l=500)=>String(v??"").trim().toLowerCase().slice(0,l);
const MONEY=/invoice|payment|receipt|bank|cash|revenue|payable|receivable|ledger|journal|trial[_ -]?balance|payroll|wallet|billing|refund|tax|vat|cost|price|quotation|order/;
const OPERATING=/inventory|stock|recipe|booking|reservation|attendance|employee|assignment|work[_ -]?order|project|customer|supplier|compliance|document|production|dispatch|schedule/;
const DRIVER=/revenue|sales|invoice|payment|bank|cash|inventory|stock|recipe|booking|attendance|employee|payroll|cost|supplier|customer|quotation|order|project/;
const riskScore=(r)=>{const x=text(r,40);return x==="critical"?1:x==="high"?.85:x==="medium"?.55:x==="low"?.25:.35};
const modeScore=(m)=>{const x=text(m,40);return ["write","draft","approve"].includes(x)?1:x==="read"?.35:.45};
export function assessAvantiqoCapabilityCriticality({capability={},dependency={},experience={}}={}){
 const key=text(capability.key,400),desc=text(capability.description,1400),hay=`${key} ${desc}`;
 const money=MONEY.test(hay)?1:0, operating=OPERATING.test(hay)?.75:0, driver=DRIVER.test(hay)?.8:0;
 const risk=riskScore(capability.risk), mutation=modeScore(capability.mode);
 const centrality=bounded(dependency.dependency_centrality_score,0);
 const verifierDependents=Math.min(1,Math.log1p(Number(dependency.verification_dependent_count||0))/Math.log(8));
 const usage=Math.min(1,Math.log1p(Number(experience.turn_count||0))/Math.log(21));
 const verifierRole=Number(dependency.verification_dependent_count||0)>0?.8:0;
 const score=bounded(Math.max(money,driver,operating)*.2+risk*.18+mutation*.18+centrality*.16+verifierDependents*.1+usage*.08+verifierRole*.1);
 const tier=score>=.64?"A":score>=.36?"B":"C";
 return {contract:AVANTIQO_CAPABILITY_CRITICALITY_CONTRACT,criticality_score:Number(score.toFixed(4)),criticality_tier:tier,money_or_financial_state_relevance:money===1,business_driver_relevance:driver>0,operational_state_relevance:operating>0,mutation_weight:Number(mutation.toFixed(4)),risk_weight:Number(risk.toFixed(4)),dependency_centrality_score:Number(centrality.toFixed(4)),verification_dependent_weight:Number(verifierDependents.toFixed(4)),usage_weight:Number(usage.toFixed(4)),tier_policy:tier==="A"?"MASTER_AND_VERIFY":tier==="B"?"UNDERSTAND_AND_VALIDATE":"RETRIEVE_ON_DEMAND",authority_effect:"NONE"};
}
export const AvantiqoCapabilityCriticalityRuntime=Object.freeze({contract:AVANTIQO_CAPABILITY_CRITICALITY_CONTRACT,assess:assessAvantiqoCapabilityCriticality});
