import {
  registerDocumentRenderers,
} from "./registerDocumentRenderers";

import {
  registerDocumentBuilders,
} from "../builders/registerDocumentBuilders";


let initialized = false;


export function initDocumentEngine(){

  if(initialized){
    return;
  }


  registerDocumentRenderers();

  registerDocumentBuilders();


  initialized = true;

}
