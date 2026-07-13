import {
  CUSTOMER_CAPABILITIES,
} from "./capabilities/customer";


const CAPABILITIES = {

  ...CUSTOMER_CAPABILITIES,

};


export const CapabilityRegistry = {

  all() {
    return CAPABILITIES;
  },


  get(id) {
    return CAPABILITIES[id];
  }

};
