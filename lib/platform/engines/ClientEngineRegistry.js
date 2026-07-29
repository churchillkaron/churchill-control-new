import CreateEngineRouter from "@/components/workspace/engines/CreateEngineRouter";
import ImportEngine from "@/components/workspace/engines/ImportEngine";
import ExportEngine from "@/components/workspace/engines/ExportEngine";
import AIEngine from "@/components/workspace/engines/AIEngine";
import FinanceRecordMutationEngine from "@/components/workspace/engines/FinanceRecordMutationEngine";
import FinanceJournalDetailEngine from "@/components/workspace/engines/FinanceJournalDetailEngine";
import FinanceDocumentTemplateBuilderEngine from "@/components/workspace/engines/FinanceDocumentTemplateBuilderEngine";
import WalletTopUpEngine from "@/components/workspace/engines/WalletTopUpEngine";
import CompleteEngine from "@/components/workspace/engines/workflow/CompleteEngine";
import AssignEngine from "@/components/workspace/engines/workflow/AssignEngine";
import ChannelConnectionEngine from "@/components/workspace/engines/ChannelConnectionEngine";

const CLIENT_ENGINES = {
  create: CreateEngineRouter,
  form: CreateEngineRouter,
  document: CreateEngineRouter,
  capability: CreateEngineRouter,
  finance_record_mutation: FinanceRecordMutationEngine,
  finance_journal_detail: FinanceJournalDetailEngine,
  finance_document_template_builder: FinanceDocumentTemplateBuilderEngine,
  import: ImportEngine,
  export: ExportEngine,
  ai: AIEngine,
  wallet_topup: WalletTopUpEngine,
  complete: CompleteEngine,
  assign: AssignEngine,
  channel_connect: ChannelConnectionEngine,
  channel_disconnect: ChannelConnectionEngine,
  channel_refresh: ChannelConnectionEngine,
};

export function getClientEngine(name) {
  return CLIENT_ENGINES[name] || null;
}
