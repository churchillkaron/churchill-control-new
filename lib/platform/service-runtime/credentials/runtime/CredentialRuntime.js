import {

  save,

  get,

} from "../repositories/CredentialRepository";


export const CredentialRuntime = {


  async store({

    provider_id,

    credential_type,

    secret_reference,

    metadata = {},

  }) {


    return save({

      provider_id,

      credential_type,

      secret_reference,

      metadata,

      status:
        "ACTIVE",

    });


  },



  async resolve(

    credential_id

  ) {


    return get(

      credential_id

    );


  },


};
