import CreateEngine from "@/components/workspace/engines/CreateEngine";
import ImportEngine from "@/components/workspace/engines/ImportEngine";
import ExportEngine from "@/components/workspace/engines/ExportEngine";
import AIEngine from "@/components/workspace/engines/AIEngine";
import WalletTopUpEngine from "@/components/workspace/engines/WalletTopUpEngine";
import CompleteEngine from "@/components/workspace/engines/workflow/CompleteEngine";
import AssignEngine from "@/components/workspace/engines/workflow/AssignEngine";
import ChannelConnectionEngine from "@/components/workspace/engines/ChannelConnectionEngine";


const CLIENT_ENGINES = {

  create: CreateEngine,

  form: CreateEngine,

  document: CreateEngine,

  capability: CreateEngine,

  import: ImportEngine,

  export: ExportEngine,

  ai: AIEngine,

  wallet_topup: WalletTopUpEngine,

  complete: CompleteEngine,

  assign: AssignEngine,


  channel_connect:
    ChannelConnectionEngine,

  channel_disconnect:
    ChannelConnectionEngine,

  channel_refresh:
    ChannelConnectionEngine,

};


export function getClientEngine(name){

  return CLIENT_ENGINES[name] || null;

}
