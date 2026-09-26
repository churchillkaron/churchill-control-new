import { understandHumanBusinessPartnerTurn } from './OperatorHumanBusinessPartnerUnderstandingRuntime.js';
import { findOperatorFastAction, listOperatorFastActions } from './OperatorFastActionIndex.js';
import { listOperatorFastReads } from './OperatorFastReadIndex.js';
import { resolveOperatorCapabilityMatch } from './OperatorCapabilityMatcher.js';

const CONTRACT='AVANTIQO_BUSINESS_PARTNER_BENCHMARK_EVIDENCE_PACKET_V1';
function text(v,n=6000){return String(v??'').trim().slice(0,n)}
function object(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
function affirmative(v){return /^(?:yes(?:,)?(?: do it)?|do it|go ahead|continue|confirmed|confirm|approved|approve)[.! ]*$/i.test(text(v,300))}

export function parseBusinessPartnerBrowserBenchmarkEnvelope(message){
  const raw=String(message??'');
  if(!raw.includes(CONTRACT) || !raw.includes('Synthetic benchmark context and evidence packet:') || !raw.includes('Benchmark case:')) return null;
  const evidenceStart=raw.indexOf('Synthetic benchmark context and evidence packet:')+'Synthetic benchmark context and evidence packet:'.length;
  const caseMarker=raw.indexOf('\n\nBenchmark case:',evidenceStart);
  if(caseMarker<0) return null;
  const caseStart=caseMarker+'\n\nBenchmark case:'.length;
  const schemaMarker=raw.indexOf('\n\nReturn one JSON object with exactly these fields:',caseStart);
  if(schemaMarker<0) return null;
  let evidencePacket=null;
  try{evidencePacket=JSON.parse(raw.slice(evidenceStart,caseMarker).trim())}catch{return null}
  if(text(evidencePacket?.contract,180)!==CONTRACT || evidencePacket?.synthetic_only!==true) return null;
  const casePrompt=raw.slice(caseStart,schemaMarker).trim();
  if(!casePrompt) return null;
  return {evidencePacket,casePrompt};
}

function baseConversation(packet){
  const prior=object(packet?.durable_conversation?.last_completed_business_action);
  const request=text(packet?.durable_conversation?.prior_user_request,1800);
  if(!request) return [];
  return [
    {role:'user',content:request},
    {role:'assistant',content:'The customer invoice was created and independently verified.',execution:{status:'completed',capability:{key:text(prior.capability_key,300)||'finance.accounts_receivable.CreateCustomerInvoice',mode:'write'},result:{success:true,invoice:{id:text(prior.result_id,200)||null,invoice_number:text(prior.invoice_number,120)||null}}}},
  ];
}
function baseProjectState(packet){
  const prior=object(packet?.durable_conversation?.last_completed_business_action);
  return {
    objective:text(packet?.durable_conversation?.prior_user_request,1400)||null,
    status:'active',
    last_intent:'business.write',
    progress_summary:'verified progress preserved for safe continuation',
    last_execution:{status:'completed',capability:{key:text(prior.capability_key,300)||'finance.accounts_receivable.CreateCustomerInvoice',mode:'write'},result:{success:true,invoice:{id:text(prior.result_id,200)||null,invoice_number:text(prior.invoice_number,120)||null}}},
    user_confirmed_complete:false,
  };
}
function baseAgreementState(packet,message){
  const prior=object(packet?.durable_conversation?.last_completed_business_action);
  const capabilityKey=text(prior.capability_key,300)||'finance.accounts_receivable.CreateCustomerInvoice';
  const base={autonomous_run:{status:'completed',planned_steps:[{status:'completed',capability_key:capabilityKey,payload:{party_id:text(prior.party_id,200)||null}}]}};
  if(affirmative(message)) base.pending_execution={capability_key:capabilityKey,payload:{party_id:text(prior.party_id,200)||null},requires_confirmation:true};
  return base;
}
function bestCapability(message,mode,understanding){
  if(mode==='write'){
    const registered=findOperatorFastAction(understanding?.registered_write_capability_key);
    if(registered) return registered;
  }
  const capabilities=mode==='write'?listOperatorFastActions():listOperatorFastReads();
  return resolveOperatorCapabilityMatch({message,capabilities,modes:[mode],limit:5})?.top?.capability||null;
}
function project({message,understanding,evidencePacket}){
  const route=text(understanding?.route,80).toLowerCase();
  const mutation=understanding?.requires_mutation===true;
  const productChange=mutation&&text(understanding?.execution_domain,80)==='product_engineering';
  const recovery=understanding?.deterministic_recovery_continuation===true;
  const verification=understanding?.deterministic_verification_request===true;
  const evidenceFailure=understanding?.deterministic_evidence_failure===true;
  const actionType=productChange?'product_change':recovery?'recover':verification?'verify':mutation?'write':route==='evidence'?'read':'conversation';
  const registeredReadKey=text(understanding?.registered_read_capability_key,300);
  const capability=actionType==='write'?bestCapability(message,'write',understanding):actionType==='read'?(listOperatorFastReads().find(c=>c.key===registeredReadKey)||bestCapability(message,'read',understanding)):null;
  const clarificationRequired=understanding?.clarification_required===true;
  const confirmedPending=understanding?.deterministic_pending_action_confirmation===true;
  const confirmationRequired=actionType==='write'&&!clarificationRequired&&!confirmedPending&&(understanding?.requires_confirmation_override===true||capability?.requires_confirmation===true);
  const needsCurrentEvidence=['read','write','verify','recover'].includes(actionType)||understanding?.needs_current_evidence===true;
  const hasCoreOwnerAuthority=evidencePacket?.current_context?.avantiqo_core_owner_authority===true;
  const wouldExecuteNow=!clarificationRequired&&!evidenceFailure&&(['read','conversation','verify','recover'].includes(actionType)||(actionType==='write'&&(confirmedPending||!confirmationRequired))||(actionType==='product_change'&&hasCoreOwnerAuthority));
  let finality='answer';
  if(clarificationRequired) finality='clarify'; else if(evidenceFailure) finality='blocked'; else if(actionType==='recover') finality='recover'; else if(actionType==='verify') finality='verified'; else if(actionType==='product_change'&&!hasCoreOwnerAuthority) finality='blocked'; else if(actionType==='write'&&confirmationRequired) finality='pending_confirmation'; else if(actionType==='write') finality='execute_then_verify';
  let response;
  if(clarificationRequired) response=text(understanding?.clarification_question,900)||'I need one focused clarification before I can safely continue.';
  else if(evidenceFailure) response='The authoritative current-state read failed, so I would not guess or present stale data as current. I would keep the mission open until fresh evidence is available.';
  else if(actionType==='recover') response='I would continue from the durable verified progress, avoid replaying completed work, and recover the original mission safely before claiming completion.';
  else if(actionType==='verify') response='I would independently re-read the authoritative business state and only report the change as complete if that fresh verification confirms the business effect.';
  else if(actionType==='product_change'&&!hasCoreOwnerAuthority) response='This is a core product change, but the supplied role has no Avantiqo core-owner authority. I would not execute or deploy it.';
  else if(actionType==='write'&&confirmationRequired) response='I resolved the exact governed write from the current request and fresh evidence. Required confirmation still applies, so no mutation has been executed yet.';
  else if(actionType==='write') response='The governed write is authorized for this step. I would execute it once and independently verify the business effect before reporting completion.';
  else if(actionType==='read') response=text(capability?.key||registeredReadKey,300)?`I would read fresh authoritative data through ${text(capability?.key||registeredReadKey,300)} and return the current result without changing business state.`:'I would use the fresh internal evidence required by this question and return the result without changing business state.';
  else response='I would answer from the supplied context without changing business state.';
  return {understanding:text(understanding?.user_goal,1400)||text(message,1400),goal_relation:text(understanding?.goal_relation,80)||'unknown',action_type:actionType,capability_or_tool:text(capability?.key||understanding?.execution_domain,500)||null,needs_current_evidence:needsCurrentEvidence,confirmation_required:confirmationRequired,clarification_required:clarificationRequired,would_execute_now:wouldExecuteNow,finality,response};
}

export async function runBusinessPartnerBrowserBenchmarkTurn({organizationId,partyId,entityId,message}={}){
  const envelope=parseBusinessPartnerBrowserBenchmarkEnvelope(message);
  if(!envelope) return null;
  const {evidencePacket,casePrompt}=envelope;
  const understanding=await understandHumanBusinessPartnerTurn({
    organizationId,partyId,entityId,message:casePrompt,
    conversation:baseConversation(evidencePacket),agreementState:baseAgreementState(evidencePacket,casePrompt),projectState:baseProjectState(evidencePacket),longTermMemory:[],
    timezone:evidencePacket?.current_context?.timezone||'Asia/Bangkok',pathname:'/business-partner/benchmark-browser',
  });
  if(!understanding) throw new Error('BUSINESS_PARTNER_BROWSER_BENCHMARK_UNDERSTANDING_EMPTY');
  return {contract:'AVANTIQO_BUSINESS_PARTNER_BROWSER_BENCHMARK_TURN_V1',synthetic_only:true,business_mutation_performed:false,conversation_persisted:false,decision:project({message:casePrompt,understanding,evidencePacket})};
}
