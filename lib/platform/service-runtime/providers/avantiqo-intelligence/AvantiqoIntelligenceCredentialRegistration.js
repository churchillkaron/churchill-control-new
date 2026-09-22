export const AVANTIQO_INTELLIGENCE_CREDENTIAL_REGISTRATION_CONTRACT = "AVANTIQO_INTELLIGENCE_LOCAL_ONLY_V1";
export function registerAvantiqoIntelligenceCredential(){ return { success:true, retired:true, credential_required:false, infrastructure_provider:"AVANTIQO_LOCAL_NODE_V1", local_only:true }; }
export const AvantiqoIntelligenceCredentialRegistration=Object.freeze({contract:AVANTIQO_INTELLIGENCE_CREDENTIAL_REGISTRATION_CONTRACT,retired:true,register:registerAvantiqoIntelligenceCredential});
export default AvantiqoIntelligenceCredentialRegistration;
