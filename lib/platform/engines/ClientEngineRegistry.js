import CreateEngineRouter from "@/components/workspace/engines/CreateEngineRouter";
import ImportEngine from "@/components/workspace/engines/ImportEngine";
import ExportEngine from "@/components/workspace/engines/ExportEngine";
import AIEngine from "@/components/workspace/engines/AIEngine";
import FinanceRecordMutationEngine from "@/components/workspace/engines/FinanceRecordMutationEngine";
import FinanceJournalDetailEngine from "@/components/workspace/engines/FinanceJournalDetailEngine";
import FinanceDocumentTemplateBuilderEngine from "@/components/workspace/engines/FinanceDocumentTemplateBuilderEngine";
import FinanceForecastScenarioEngine from "@/components/workspace/engines/FinanceForecastScenarioEngine";
import FinanceForecastVersionEngine from "@/components/workspace/engines/FinanceForecastVersionEngine";
import FinanceForecastPerformanceEngine from "@/components/workspace/engines/FinanceForecastPerformanceEngine";
import FinanceForecastPortfolioEngine from "@/components/workspace/engines/FinanceForecastPortfolioEngine";
import FinanceForecastExceptionsEngine from "@/components/workspace/engines/FinanceForecastExceptionsEngine";
import FinanceForecastExceptionOversightEngine from "@/components/workspace/engines/FinanceForecastExceptionOversightEngine";
import FinanceForecastGovernanceDashboardEngine from "@/components/workspace/engines/FinanceForecastGovernanceDashboardEngine";
import FinanceCustomerDepositLiabilityEngine from "@/components/workspace/engines/FinanceCustomerDepositLiabilityEngine";
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
  finance_forecast_scenarios: FinanceForecastScenarioEngine,
  finance_forecast_versions: FinanceForecastVersionEngine,
  finance_forecast_performance: FinanceForecastPerformanceEngine,
  finance_forecast_portfolio: FinanceForecastPortfolioEngine,
  finance_forecast_exceptions: FinanceForecastExceptionsEngine,
  finance_forecast_exception_oversight: FinanceForecastExceptionOversightEngine,
  finance_forecast_governance_dashboard: FinanceForecastGovernanceDashboardEngine,
  finance_customer_deposit_liability: FinanceCustomerDepositLiabilityEngine,
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
