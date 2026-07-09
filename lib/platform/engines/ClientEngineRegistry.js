import CreateEngine from "@/components/workspace/engines/CreateEngine";
import ImportEngine from "@/components/workspace/engines/ImportEngine";
import ExportEngine from "@/components/workspace/engines/ExportEngine";
import AIEngine from "@/components/workspace/engines/AIEngine";
import WalletTopUpEngine from "@/components/workspace/engines/WalletTopUpEngine";


const CLIENT_ENGINES = {

  create: CreateEngine,

  form: CreateEngine,

  document: CreateEngine,

  capability: CreateEngine,

  import: ImportEngine,

  export: ExportEngine,

  ai: AIEngine,

  wallet_topup: WalletTopUpEngine,

};


export function getClientEngine(name){

  return CLIENT_ENGINES[name] || null;

}
