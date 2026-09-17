export const AVANTIQO_CAPABILITY_LEARNING_PRIORITY_CONTRACT = "AVANTIQO_CAPABILITY_LEARNING_PRIORITY_V1";

const bounded=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):fallback};
const riskWeight=(risk)=>{const value=String(risk||"").trim().toLowerCase();if(value==="critical")return 1;if(value==="high")return 0.8;if(value==="medium")return 0.5;if(value==="low")return 0.25;return 0.35};

export function scoreAvantiqoCapabilityLearningPriority({capability={},coverage={},experience={},dependency={}}={}){
  const gap=1-bounded(coverage.score,0);
  const weightedOutcomes=Math.max(0,Number(coverage.outcome_weighted_evidence_units||0));
  const liveOutcomes=Math.max(0,Number(coverage.live_verified_outcome_count||0));
  const readinessSuccess=Math.max(0,Number(coverage.readiness?.success_evidence_units||0));
  const experienceTurns=Math.max(0,Number(experience.turn_count||0));
  const verifiedExperience=Math.max(0,Number(experience.verified_outcome_count||0));
  const experienceSignal=Math.min(6,Math.log1p(experienceTurns)*1.5+verifiedExperience*0.35);
  const usageEvidence=weightedOutcomes+liveOutcomes*0.5+readinessSuccess*0.25+experienceSignal;
  const usage=Math.min(1,Math.log1p(usageEvidence)/Math.log(9));
  const risk=riskWeight(capability.risk);
  const dependencyCentrality=bounded(dependency.dependency_centrality_score,0);
  const exploration=usageEvidence===0?0.05:0;
  const priority=gap*(0.3+usage*0.4+risk*0.15+dependencyCentrality*0.15)+exploration*gap;
  return {
    contract:AVANTIQO_CAPABILITY_LEARNING_PRIORITY_CONTRACT,
    priority:Number(Math.min(1,priority).toFixed(4)),
    intelligence_gap:Number(gap.toFixed(4)),
    usage_evidence_units:Number(usageEvidence.toFixed(4)),
    experience_turn_count:experienceTurns,
    experience_signal_units:Number(experienceSignal.toFixed(4)),
    usage_score:Number(usage.toFixed(4)),
    business_risk_score:risk,
    dependency_centrality_score:Number(dependencyCentrality.toFixed(4)),
    exploration_credit:Number((exploration*gap).toFixed(4)),
    authority_effect:"NONE",
  };
}

export const AvantiqoCapabilityLearningPriorityRuntime=Object.freeze({contract:AVANTIQO_CAPABILITY_LEARNING_PRIORITY_CONTRACT,score:scoreAvantiqoCapabilityLearningPriority});
