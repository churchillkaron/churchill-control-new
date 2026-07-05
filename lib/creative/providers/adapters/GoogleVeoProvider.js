import {
CreativeProviderContract,
} from "../contracts/CreativeProviderContract";

export class GoogleVeoProvider
extends CreativeProviderContract{

async submitJob(task){

return{

provider:"google_veo",

provider_job_id:
crypto.randomUUID(),

status:"SUBMITTED",

task,

};

}

async getJobStatus(job){

return{

...job,

status:"COMPLETED",

progress:100,

};

}

async downloadResult(job){

return{

provider:"google_veo",

provider_job_id:
job.provider_job_id,

asset_url:null,

thumbnail_url:null,

metadata:{},

};

}

}
