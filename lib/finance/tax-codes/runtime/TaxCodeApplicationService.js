import {
  upsertTaxCode,
} from "../repositories/taxCodeRepository";


export async function upsertTaxCodeCommand(input){

  return await upsertTaxCode(input);

}
