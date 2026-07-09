import CreateEngine from "@/components/workspace/engines/CreateEngine";
import PreviewEngine from "@/components/workspace/engines/PreviewEngine";
import ImportEngine from "@/components/workspace/engines/ImportEngine";
import ExportEngine from "@/components/workspace/engines/ExportEngine";
import AIEngine from "@/components/workspace/engines/AIEngine";

import WalletTopUpEngine from "@/components/workspace/engines/WalletTopUpEngine";

import ApproveEngine from "@/components/workspace/engines/workflow/ApproveEngine";
import RejectEngine from "@/components/workspace/engines/workflow/RejectEngine";
import AssignEngine from "@/components/workspace/engines/workflow/AssignEngine";
import CompleteEngine from "@/components/workspace/engines/workflow/CompleteEngine";
import ReopenEngine from "@/components/workspace/engines/workflow/ReopenEngine";

import MergeEngine from "@/components/workspace/engines/generic/MergeEngine";
import SplitEngine from "@/components/workspace/engines/generic/SplitEngine";
import DuplicateEngine from "@/components/workspace/engines/generic/DuplicateEngine";
import ArchiveEngine from "@/components/workspace/engines/generic/ArchiveEngine";
import DeleteEngine from "@/components/workspace/engines/generic/DeleteEngine";
import RestoreEngine from "@/components/workspace/engines/generic/RestoreEngine";
import SyncEngine from "@/components/workspace/engines/generic/SyncEngine";
import PublishEngine from "@/components/workspace/engines/generic/PublishEngine";

import ReconcileEngine from "@/components/workspace/engines/finance/ReconcileEngine";
import PostEngine from "@/components/workspace/engines/finance/PostEngine";
import ReverseEngine from "@/components/workspace/engines/finance/ReverseEngine";
import AllocateEngine from "@/components/workspace/engines/finance/AllocateEngine";
import ClosePeriodEngine from "@/components/workspace/engines/finance/ClosePeriodEngine";
import LockEngine from "@/components/workspace/engines/finance/LockEngine";
import UnlockEngine from "@/components/workspace/engines/finance/UnlockEngine";

import EmailEngine from "@/components/workspace/engines/communication/EmailEngine";
import SMSEngine from "@/components/workspace/engines/communication/SMSEngine";
import WhatsAppEngine from "@/components/workspace/engines/communication/WhatsAppEngine";

import PrintEngine from "@/components/workspace/engines/document/PrintEngine";
import DownloadEngine from "@/components/workspace/engines/document/DownloadEngine";
import UploadEngine from "@/components/workspace/engines/document/UploadEngine";
import AttachEngine from "@/components/workspace/engines/document/AttachEngine";
import SignEngine from "@/components/workspace/engines/document/SignEngine";
import OCREngine from "@/components/workspace/engines/document/OCREngine";
import ConvertEngine from "@/components/workspace/engines/document/ConvertEngine";

import AuditEngine from "@/components/workspace/engines/system/AuditEngine";
import HistoryEngine from "@/components/workspace/engines/system/HistoryEngine";
import TimelineEngine from "@/components/workspace/engines/system/TimelineEngine";
import PermissionsEngine from "@/components/workspace/engines/system/PermissionsEngine";
import SettingsEngine from "@/components/workspace/engines/system/SettingsEngine";


export const ENGINE_REGISTRY = {

  create: CreateEngine,
  form: CreateEngine,

  wallet_topup: WalletTopUpEngine,

  preview: PreviewEngine,

  import: ImportEngine,
  export: ExportEngine,

  ai: AIEngine,

  approve: ApproveEngine,
  reject: RejectEngine,
  assign: AssignEngine,
  complete: CompleteEngine,
  reopen: ReopenEngine,

  merge: MergeEngine,
  split: SplitEngine,
  duplicate: DuplicateEngine,
  archive: ArchiveEngine,
  delete: DeleteEngine,
  restore: RestoreEngine,

  sync: SyncEngine,
  publish: PublishEngine,

  reconcile: ReconcileEngine,
  post: PostEngine,
  reverse: ReverseEngine,
  allocate: AllocateEngine,
  close_period: ClosePeriodEngine,
  lock: LockEngine,
  unlock: UnlockEngine,

  email: EmailEngine,
  sms: SMSEngine,
  whatsapp: WhatsAppEngine,

  print: PrintEngine,
  download: DownloadEngine,
  upload: UploadEngine,
  attach: AttachEngine,
  sign: SignEngine,
  ocr: OCREngine,
  convert: ConvertEngine,

  audit: AuditEngine,
  history: HistoryEngine,
  timeline: TimelineEngine,
  permissions: PermissionsEngine,
  settings: SettingsEngine,

};


export function getEngine(name){

  return ENGINE_REGISTRY[name] || null;

}
